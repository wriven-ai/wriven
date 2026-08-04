import { create } from 'zustand';
import type { AuthResult, ProjectView, SessionView, UserView, WorkspaceView } from '../lib/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: UserView | null;
  workspaces: WorkspaceView[];
  projects: ProjectView[];
  /** Active workspace id — a mirror of the URL, kept so the API client can set
   *  the X-Workspace-Id header. Not persisted: the URL is the source of truth. */
  currentWorkspaceId: string | null;
  /** Active project id — a URL mirror, used for the X-Project-Id header. */
  currentProjectId: string | null;

  /** Apply login/register result. */
  setAuthResult: (result: AuthResult) => void;
  /** Apply GET /auth/me session (reload restore). */
  setSession: (session: SessionView) => void;
  setWorkspace: (workspaceId: string) => void;
  setProject: (projectId: string) => void;
  /** Mirror the URL scope into the store (no side effects). Used by route sync. */
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  /** Append a freshly-created workspace so URL navigation resolves it at once. */
  addWorkspace: (workspace: WorkspaceView) => void;
  setUnauthenticated: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  (set, get) => ({
      status: 'loading',
      user: null,
      workspaces: [],
      projects: [],
      currentWorkspaceId: null,
      currentProjectId: null,

      setAuthResult: (result) =>
        set({
          status: 'authenticated',
          user: result.user,
          workspaces: [result.workspace],
          // No project on signup — the user creates one from the workspace UI.
          projects: [],
          currentWorkspaceId: result.workspace.id,
          currentProjectId: null,
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

      setCurrentWorkspaceId: (workspaceId) =>
        set({ currentWorkspaceId: workspaceId }),

      setCurrentProjectId: (projectId) =>
        set({ currentProjectId: projectId }),

      addWorkspace: (workspace) =>
        set((state) =>
          state.workspaces.some((w) => w.id === workspace.id)
            ? state
            : { workspaces: [...state.workspaces, workspace] },
        ),

      setUnauthenticated: () =>
        set({
          status: 'unauthenticated',
          user: null,
          workspaces: [],
          projects: [],
        }),

      clear: () =>
        set({
          status: 'unauthenticated',
          user: null,
          workspaces: [],
          projects: [],
          currentWorkspaceId: null,
          currentProjectId: null,
        }),
  }),
);
