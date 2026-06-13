import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResult, OrgView, SessionView, UserView, WorkspaceView } from '../lib/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  /** Access token — kept in memory only, never persisted. */
  accessToken: string | null;
  user: UserView | null;
  orgs: OrgView[];
  workspaces: WorkspaceView[];
  /** Selected workspace id — persisted (non-sensitive). */
  currentWorkspaceId: string | null;

  setAccessToken: (token: string | null) => void;
  /** Apply login/register result. */
  setAuthResult: (result: AuthResult) => void;
  /** Apply GET /auth/me session (reload restore). */
  setSession: (session: SessionView) => void;
  setWorkspace: (workspaceId: string) => void;
  setUnauthenticated: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'loading',
      accessToken: null,
      user: null,
      orgs: [],
      workspaces: [],
      currentWorkspaceId: null,

      setAccessToken: (token) => set({ accessToken: token }),

      setAuthResult: (result) =>
        set({
          status: 'authenticated',
          accessToken: result.accessToken,
          user: result.user,
          orgs: [result.org],
          workspaces: [result.workspace],
          currentWorkspaceId: result.workspace.id,
        }),

      setSession: (session) => {
        const persisted = get().currentWorkspaceId;
        const valid = session.workspaces.some((w) => w.id === persisted);
        set({
          status: 'authenticated',
          user: session.user,
          orgs: session.orgs,
          workspaces: session.workspaces,
          currentWorkspaceId: valid
            ? persisted
            : (session.workspaces[0]?.id ?? null),
        });
      },

      setWorkspace: (workspaceId) => set({ currentWorkspaceId: workspaceId }),

      setUnauthenticated: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          user: null,
          orgs: [],
          workspaces: [],
        }),

      clear: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          user: null,
          orgs: [],
          workspaces: [],
          currentWorkspaceId: null,
        }),
    }),
    {
      name: 'wriven-auth',
      // Only the selected workspace id is persisted; tokens stay in memory.
      partialize: (state) => ({ currentWorkspaceId: state.currentWorkspaceId }),
    },
  ),
);
