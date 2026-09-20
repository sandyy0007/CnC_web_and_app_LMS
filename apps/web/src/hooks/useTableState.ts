'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { rememberTableState } from '@/store/uiSlice';

export interface TableState {
  search: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters: Record<string, string>;
}

const DEFAULTS: TableState = { search: '', page: 1, pageSize: 20, filters: {} };

/**
 * Search/filter/sort/page state, remembered per table for the session (SRS FR-13).
 *
 * This is a convenience only. Filters can never widen what the caller may see: the server
 * re-derives scope on every request and rejects any value outside it.
 */
export function useTableState(key: string, initial?: Partial<TableState>) {
  const dispatch = useAppDispatch();
  const remembered = useAppSelector((state) => state.ui.tableState[key]);
  const [state, setState] = useState<TableState>({
    ...DEFAULTS,
    ...initial,
    ...(remembered as Partial<TableState> | undefined),
  });

  useEffect(() => {
    dispatch(rememberTableState({ key, value: state as unknown as Record<string, unknown> }));
  }, [dispatch, key, state]);

  const setSearch = useCallback(
    (search: string) => setState((prev) => ({ ...prev, search, page: 1 })),
    [],
  );
  const setPage = useCallback((page: number) => setState((prev) => ({ ...prev, page })), []);
  const setPageSize = useCallback(
    (pageSize: number) => setState((prev) => ({ ...prev, pageSize, page: 1 })),
    [],
  );
  const setFilter = useCallback(
    (name: string, value: string) =>
      setState((prev) => ({ ...prev, filters: { ...prev.filters, [name]: value }, page: 1 })),
    [],
  );
  const toggleSort = useCallback(
    (field: string) =>
      setState((prev) => ({
        ...prev,
        sortBy: field,
        sortDir: prev.sortBy === field && prev.sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      })),
    [],
  );
  const reset = useCallback(() => setState({ ...DEFAULTS, ...initial }), [initial]);

  /** Query params for the API call, with empty values dropped. */
  const params: Record<string, string | number> = {
    page: state.page,
    pageSize: state.pageSize,
  };
  if (state.search) params.search = state.search;
  if (state.sortBy) {
    params.sortBy = state.sortBy;
    params.sortDir = state.sortDir ?? 'asc';
  }
  for (const [name, value] of Object.entries(state.filters)) {
    if (value && value !== 'all') params[name] = value;
  }

  return { state, params, setSearch, setPage, setPageSize, setFilter, toggleSort, reset };
}
