import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, getAccessToken, request, setAccessToken, setUnauthenticatedHandler } from './api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  beforeEach(() => {
    setAccessToken(null);
    setUnauthenticatedHandler(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('never persists the access token outside memory', async () => {
    setAccessToken('token-abc');
    expect(getAccessToken()).toBe('token-abc');
    // The whole point of holding it in a module variable: nothing reaches web storage.
    expect(window.localStorage.getItem('accessToken')).toBeNull();
    expect(String(window.localStorage.length)).toBe('0');
  });

  it('sends the bearer token and credentials on every call', async () => {
    setAccessToken('token-abc');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/student/courses');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/student/courses');
    expect(init.credentials).toBe('include');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token-abc');
  });

  it('drops empty query parameters instead of sending blanks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/hod/participants', { search: '', batchId: 'b1', page: 2 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/hod/participants?batchId=b1&page=2');
  });

  it('refreshes once and replays the request after a 401', async () => {
    const fetchMock = vi
      .fn()
      // the original request
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'nope' } }, 401))
      // the refresh
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: 'fresh' } }))
      // the replay
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/auth/me');

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(getAccessToken()).toBe('fresh');
  });

  it('does not reuse a settled refresh for a later 401', async () => {
    // The rotation lock exists to collapse *concurrent* 401s. A request that fails later must
    // start a fresh rotation, or a second expiry silently logs the user out.
    let refreshes = 0;
    let issued = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/refresh')) {
          refreshes += 1;
          issued += 1;
          return jsonResponse({ success: true, data: { accessToken: `token-${issued}` } });
        }
        const headers = init?.headers as Headers | undefined;
        // Only the most recently issued token is accepted.
        if (headers?.get('Authorization') !== `Bearer token-${issued}`) {
          return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, 401);
        }
        return jsonResponse({ success: true, data: { ok: true } });
      }),
    );

    await api.get('/first');
    // Expire the in-memory token the way a real expiry would, then call again.
    setAccessToken('stale');
    await api.get('/second');

    expect(refreshes).toBe(2);
  });

  it('shares one refresh between concurrent 401s so the backend sees no token reuse', async () => {
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/refresh')) {
          refreshes += 1;
          return jsonResponse({ success: true, data: { accessToken: 'fresh' } });
        }
        const headers = init?.headers as Headers | undefined;
        if (headers?.get('Authorization') !== 'Bearer fresh') {
          return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'nope' } }, 401);
        }
        return jsonResponse({ success: true, data: { ok: true } });
      }),
    );

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(refreshes).toBe(1);
  });

  it('signals the app once when the refresh itself fails', async () => {
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);
    setAccessToken('stale');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/auth/refresh')
          ? jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401)
          : jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401),
      ),
    );

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('surfaces field errors from a validation response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the form',
              details: [{ field: 'email', message: 'Already registered' }],
            },
          },
          422,
        ),
      ),
    );

    await expect(api.post('/auth/signup', {})).rejects.toSatisfy((error: unknown) => {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(422);
      expect(apiError.fieldErrors.email).toBe('Already registered');
      return true;
    });
  });

  it('turns a network failure into a readable error rather than throwing raw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(request('/anything')).rejects.toSatisfy((error: unknown) => {
      const apiError = error as ApiError;
      expect(apiError.code).toBe('NETWORK_ERROR');
      expect(apiError.message).toMatch(/couldn't reach the server/i);
      return true;
    });
  });
});
