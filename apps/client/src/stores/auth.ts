import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResult, ProjectView, SessionView, UserView, WorkspaceView } from '../lib/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  /** Access token — kept in memory only, never persisted. */
  accessToken: string | null;
  user: UserView | null;
  workspaces: WorkspaceView[];
  projects: ProjectView[];
  /** Selected workspace id — persisted (non-sensitive). */
  currentWorkspaceId: string | null;
  /** Selected project id — persisted (non-sensitive). */
  currentProjectId: string | null;

  setAccessToken: (token: string | null) => void;
  /** Apply login/register result. */
  setAuthResult: (result: AuthResult) => void;
  /** Apply GET /auth/me session (reload restore). */
  setSession: (session: SessionView) => void;
  setWorkspace: (workspaceId: string) => void;
  setProject: (projectId: string) => void;
  setUnauthenticated: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'loading',
      accessToken: null,
      user: null,
      workspaces: [],
      projects: [],
      currentWorkspaceId: null,
      currentProjectId: null,

      setAccessToken: (token) => set({ accessToken: token }),

      setAuthResult: (result) =>
        set({
          status: 'authenticated',
          accessToken: result.accessToken,
          user: result.user,
          workspaces: [result.workspace],
          projects: [result.project],
          currentWorkspaceId: result.workspace.id,
          currentProjectId: result.project.id,
        }),

      setSession: (session) => {
        const persistedWs = get().currentWorkspaceId;
        const persistedProject = get().currentProjectId;
        const validWs = session.workspaces.some((w) => w.id === persistedWs);
        const currentWsId = validWs
          ? persistedWs!
          : (session.workspaces[0]?.id ?? null);
        // Projects belonging to the resolved current workspace.
        const wsProjects = session.projects.filter(
          (p) => p.workspaceId === currentWsId,
        );
        const validProject = wsProjects.some((p) => p.id === persistedProject);
        set({
          status: 'authenticated',
          user: session.user,
          workspaces: session.workspaces,
          projects: session.projects,
          currentWorkspaceId: currentWsId,
          currentProjectId: validProject
            ? persistedProject
            : (wsProjects[0]?.id ?? null),
        });
      },

      setWorkspace: (workspaceId) =>
        set((state) => {
          // When the workspace changes, fall back to its first project.
          const wsProjects = state.projects.filter(
            (p) => p.workspaceId === workspaceId,
          );
          return {
            currentWorkspaceId: workspaceId,
            currentProjectId: wsProjects[0]?.id ?? state.currentProjectId,
          };
        }),

      setProject: (projectId) => set({ currentProjectId: projectId }),

      setUnauthenticated: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          user: null,
          workspaces: [],
          projects: [],
        }),

      clear: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          user: null,
          workspaces: [],
          projects: [],
          currentWorkspaceId: null,
          currentProjectId: null,
        }),
    }),
    {
      name: 'wriven-auth',
      // Only the selected ids are persisted; tokens stay in memory.
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
        currentProjectId: state.currentProjectId,
      }),
    },
  ),
);
