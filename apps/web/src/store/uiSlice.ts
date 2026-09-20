import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  sidebarOpen: boolean;
  /** Per-table filter/sort state, kept for the session so a drill-down and back feels right
   *  (SRS FR-13). It is UX only: the server re-derives scope on every request. */
  tableState: Record<string, Record<string, unknown>>;
  unreadNotifications: number;
}

const initialState: UiState = { sidebarOpen: false, tableState: {}, unreadNotifications: 0 };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state, action: PayloadAction<boolean | undefined>) {
      state.sidebarOpen = action.payload ?? !state.sidebarOpen;
    },
    rememberTableState(
      state,
      action: PayloadAction<{ key: string; value: Record<string, unknown> }>,
    ) {
      state.tableState[action.payload.key] = action.payload.value;
    },
    setUnreadNotifications(state, action: PayloadAction<number>) {
      state.unreadNotifications = action.payload;
    },
  },
});

export const { toggleSidebar, rememberTableState, setUnreadNotifications } = uiSlice.actions;
export default uiSlice.reducer;
