import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { ApiError, api, setAccessToken } from '@/lib/api';
import type { Role } from '@/lib/roleRoutes';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  institutionId?: string | null;
  role: Role;
  roleLabel: string;
  collegeId?: string | null;
  collegeName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  emailVerified: boolean;
  status: string;
  avatarColor?: string | null;
  mustChangePassword: boolean;
  home: string;
  preferences?: Record<string, boolean>;
  assignedBatchIds?: string[];
  profile?: Record<string, any> | null;
}

export type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  error: string | null;
  signingIn: boolean;
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  error: null,
  signingIn: false,
};

/** Rehydrate from the HttpOnly refresh cookie on first load. */
export const restoreSession = createAsyncThunk('auth/restore', async (_, { rejectWithValue }) => {
  const token = await api.refresh();
  if (!token) return rejectWithValue('anonymous');
  const me = await api.get('/auth/me');
  return me.data as SessionUser;
});

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (
    payload: { identifier: string; password: string; rememberMe?: boolean },
    { rejectWithValue },
  ) => {
    try {
      const response = await api.post('/auth/login', payload);
      if (!response.success) {
        // e.g. the account exists but is not verified yet.
        return rejectWithValue({
          message: response.message as string,
          verificationRequired: Boolean(response.data?.verificationRequired),
          email: response.data?.email as string | undefined,
        });
      }
      setAccessToken(response.data.accessToken);
      return response.data.user as SessionUser;
    } catch (error) {
      const apiError = error as ApiError;
      return rejectWithValue({ message: apiError.message, code: apiError.code });
    }
  },
);

export const signOut = createAsyncThunk('auth/signOut', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

export const signOutEverywhere = createAsyncThunk('auth/signOutAll', async () => {
  try {
    await api.post('/auth/logout-all');
  } finally {
    setAccessToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state) {
      state.status = 'anonymous';
      state.user = null;
      setAccessToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    },
    userUpdated(state, action: PayloadAction<Partial<SessionUser>>) {
      if (state.user) state.user = { ...state.user, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'anonymous';
        state.user = null;
      })
      .addCase(signIn.pending, (state) => {
        state.signingIn = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.signingIn = false;
        state.status = 'authenticated';
        state.user = action.payload;
        state.error = null;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.signingIn = false;
        state.status = 'anonymous';
        state.error = (action.payload as { message?: string })?.message ?? 'Sign-in failed';
      })
      .addCase(signOut.fulfilled, (state) => {
        state.status = 'anonymous';
        state.user = null;
      })
      .addCase(signOutEverywhere.fulfilled, (state) => {
        state.status = 'anonymous';
        state.user = null;
      });
  },
});

export const { sessionExpired, clearAuthError, userUpdated } = authSlice.actions;
export default authSlice.reducer;
