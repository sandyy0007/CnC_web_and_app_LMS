import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useApi, useMutation } from './useApi';

// `vi.mock` is hoisted above the module body, so the spies have to be hoisted with it.
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

function Probe({ path, params }: { path: string | null; params?: any }) {
  const query = useApi<any>(path, params);
  return (
    <div>
      <span data-testid="state">
        {query.initialLoading ? 'loading' : query.error ? 'error' : 'ready'}
      </span>
      <span data-testid="data">{JSON.stringify(query.data)}</span>
      <button type="button" onClick={query.refetch}>
        refetch
      </button>
    </div>
  );
}

describe('useApi', () => {
  afterEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('unwraps the envelope and reports the three states in order', async () => {
    get.mockResolvedValue({ success: true, data: { name: 'Alex' } });
    render(<Probe path="/student/profile" />);

    expect(screen.getByTestId('state')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('data')).toHaveTextContent('Alex');
  });

  it('surfaces an error instead of a blank screen', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<Probe path="/student/profile" />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error'));
  });

  it('does not fetch when the path is null', async () => {
    render(<Probe path={null} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(get).not.toHaveBeenCalled();
  });

  it('refetches when the parameters change, not on every render', async () => {
    get.mockResolvedValue({ success: true, data: [] });
    const { rerender } = render(<Probe path="/hod/participants" params={{ page: 1 }} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    rerender(<Probe path="/hod/participants" params={{ page: 1 }} />);
    expect(get).toHaveBeenCalledTimes(1);

    rerender(<Probe path="/hod/participants" params={{ page: 2 }} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

function MutationProbe() {
  const mutation = useMutation((body: any) => post('/trainer/attendance', body));
  return (
    <div>
      <span data-testid="pending">{mutation.pending ? 'pending' : 'idle'}</span>
      <span data-testid="error">{mutation.error?.message ?? ''}</span>
      <button type="button" onClick={() => mutation.mutate({ ok: true })}>
        go
      </button>
    </div>
  );
}

describe('useMutation', () => {
  it('captures the error rather than throwing into the component', async () => {
    post.mockRejectedValue(new Error('conflict'));
    render(<MutationProbe />);
    await act(async () => {
      screen.getByRole('button', { name: 'go' }).click();
    });
    expect(screen.getByTestId('error')).toHaveTextContent('conflict');
    expect(screen.getByTestId('pending')).toHaveTextContent('idle');
  });
});
