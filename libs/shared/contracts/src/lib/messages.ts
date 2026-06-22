/**
 * TCP message pattern constants. Never hardcode pattern strings in callers or
 * receivers — import from here. Convention: `<service>.<action>`.
 */

export const AUTH_PATTERNS = {
  PING: 'auth.ping',
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  LOGOUT: 'auth.logout',
  FORGOT_PASSWORD: 'auth.forgotPassword',
  RESET_PASSWORD: 'auth.resetPassword',
  VERIFY_EMAIL: 'auth.verifyEmail',
  RESEND_VERIFICATION: 'auth.resendVerification',
  GOOGLE_LOGIN: 'auth.googleLogin',
  VALIDATE_USER: 'auth.validateUser',
  GET_USER_BY_ID: 'auth.getUserById',
  GET_SESSION: 'auth.getSession',
} as const;

/**
 * Top-level tenancy. A workspace is owned directly by a user and contains
 * projects. Workspace members form the team that can access the workspace.
 */
export const WORKSPACE_PATTERNS = {
  CREATE_WORKSPACE: 'auth.createWorkspace',
  GET_WORKSPACE: 'auth.getWorkspace',
  LIST_WORKSPACES: 'auth.listWorkspaces',
  UPDATE_WORKSPACE: 'auth.updateWorkspace',
  DELETE_WORKSPACE: 'auth.deleteWorkspace',
  VALIDATE_WORKSPACE_MEMBER: 'auth.validateWorkspaceMember',
  LIST_MEMBERS: 'auth.workspace.listMembers',
  ADD_MEMBER: 'auth.workspace.addMember',
  UPDATE_MEMBER: 'auth.workspace.updateMember',
  REMOVE_MEMBER: 'auth.workspace.removeMember',
} as const;

/**
 * Projects live under a workspace and own all CMS content (content types,
 * entries, media). Project members are independent of workspace members.
 */
export const PROJECT_PATTERNS = {
  CREATE_PROJECT: 'auth.createProject',
  GET_PROJECT: 'auth.getProject',
  LIST_PROJECTS: 'auth.listProjects',
  UPDATE_PROJECT: 'auth.updateProject',
  DELETE_PROJECT: 'auth.deleteProject',
  VALIDATE_PROJECT_MEMBER: 'auth.validateProjectMember',
  LIST_MEMBERS: 'auth.project.listMembers',
  ADD_MEMBER: 'auth.project.addMember',
  UPDATE_MEMBER: 'auth.project.updateMember',
  REMOVE_MEMBER: 'auth.project.removeMember',
} as const;

export const CORE_PATTERNS = {
  PING: 'core.ping',

  CONTENT_TYPE_CREATE: 'core.contentType.create',
  CONTENT_TYPE_LIST: 'core.contentType.list',
  CONTENT_TYPE_GET: 'core.contentType.get',
  CONTENT_TYPE_UPDATE: 'core.contentType.update',
  CONTENT_TYPE_DELETE: 'core.contentType.delete',

  ENTRY_CREATE: 'core.entry.create',
  ENTRY_LIST: 'core.entry.list',
  ENTRY_GET: 'core.entry.get',
  ENTRY_UPDATE: 'core.entry.update',
  ENTRY_DELETE: 'core.entry.delete',
  ENTRY_PUBLISH: 'core.entry.publish',
} as const;

/** Injection tokens for the gateway's TCP ClientProxy instances. */
export const SERVICE_TOKENS = {
  AUTH_SERVICE: 'AUTH_SERVICE',
  CORE_SERVICE: 'CORE_SERVICE',
} as const;
