'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@/lib/api';

export interface QueryResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True only on the very first load, so refetches don't flash a skeleton. */
  initialLoading: boolean;
  refetch: () => void;
}

/**
 * Data fetching with the three states every screen must handle (§24): loading, empty, error —
 * plus retry. Deliberately small: the app has no need for a cache layer, and a hook that is
 * easy to read is easier to keep correct.
 */
export function useApi<T = any>(
  path: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: { enabled?: boolean; select?: (raw: any) => T },
): QueryResult<T> {
  const enabled = options?.enabled !== false && Boolean(path);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  const selectRef = useRef(options?.select);
  selectRef.current = options?.select;
  const serialised = JSON.stringify(params ?? {});

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    api
      .get(path, JSON.parse(serialised))
      .then((response) => {
        if (!active) return;
        const select = selectRef.current;
        setData(select ? select(response) : ((response?.data ?? response) as T));
        setLoaded(true);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught as ApiError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, serialised, enabled, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, initialLoading: loading && !loaded, refetch };
}

/** A mutation with pending/error state and an optional success callback. */
export function useMutation<TBody = any, TResult = any>(
  run: (body: TBody) => Promise<TResult>,
): {
  mutate: (body: TBody) => Promise<TResult | null>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const mutate = useCallback(async (body: TBody) => {
    setPending(true);
    setError(null);
    try {
      return await runRef.current(body);
    } catch (caught) {
      setError(caught as ApiError);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { mutate, pending, error, reset: () => setError(null) };
}
