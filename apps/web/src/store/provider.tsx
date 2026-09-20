'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';

import { setUnauthenticatedHandler } from '@/lib/api';
import { makeStore, type AppStore } from '@/store';
import { restoreSession, sessionExpired } from '@/store/authSlice';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | undefined>(undefined);
  if (!storeRef.current) storeRef.current = makeStore();

  useEffect(() => {
    const store = storeRef.current!;
    // When a refresh finally fails, the whole app learns about it from one place.
    setUnauthenticatedHandler(() => store.dispatch(sessionExpired()));
    store.dispatch(restoreSession());
    return () => setUnauthenticatedHandler(null);
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
