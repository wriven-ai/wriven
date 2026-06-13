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
  VALIDATE_USER: 'auth.validateUser',
  GET_USER_BY_ID: 'auth.getUserById',
} as const;

export const ORG_PATTERNS = {
  CREATE_ORG: 'auth.createOrg',
  GET_ORG: 'auth.getOrg',
  ADD_ORG_MEMBER: 'auth.addOrgMember',
  REMOVE_ORG_MEMBER: 'auth.removeOrgMember',
} as const;

export const WORKSPACE_PATTERNS = {
  CREATE_WORKSPACE: 'auth.createWorkspace',
  GET_WORKSPACE: 'auth.getWorkspace',
  VALIDATE_WORKSPACE_MEMBER: 'auth.validateWorkspaceMember',
  ADD_WORKSPACE_MEMBER: 'auth.addWorkspaceMember',
} as const;

export const CORE_PATTERNS = {
  PING: 'core.ping',
  CREATE_POST: 'core.createPost',
  GET_POST: 'core.getPost',
  LIST_POSTS: 'core.listPosts',
} as const;

/** Injection tokens for the gateway's TCP ClientProxy instances. */
export const SERVICE_TOKENS = {
  AUTH_SERVICE: 'AUTH_SERVICE',
  CORE_SERVICE: 'CORE_SERVICE',
} as const;
