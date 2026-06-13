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

export const ORG_PATTERNS = {
  CREATE_ORG: 'auth.createOrg',
  GET_ORG: 'auth.getOrg',
  LIST_ORGS: 'auth.listOrgs',
  ADD_ORG_MEMBER: 'auth.addOrgMember',
  REMOVE_ORG_MEMBER: 'auth.removeOrgMember',
} as const;

export const WORKSPACE_PATTERNS = {
  CREATE_WORKSPACE: 'auth.createWorkspace',
  GET_WORKSPACE: 'auth.getWorkspace',
  LIST_WORKSPACES: 'auth.listWorkspaces',
  VALIDATE_WORKSPACE_MEMBER: 'auth.validateWorkspaceMember',
  ADD_WORKSPACE_MEMBER: 'auth.addWorkspaceMember',
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
