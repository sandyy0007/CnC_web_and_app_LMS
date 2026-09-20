import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import authReducer from './authSlice';
import uiReducer from './uiSlice';

export const makeStore = () =>
  configureStore({
    reducer: { auth: authReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
