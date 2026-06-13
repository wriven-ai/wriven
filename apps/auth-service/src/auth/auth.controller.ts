import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  ForgotPasswordDto,
  GoogleProfile,
  LoginDto,
  LogoutPayload,
  RefreshPayload,
  ORG_PATTERNS,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  register(@Payload() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  login(@Payload() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  refresh(@Payload() payload: RefreshPayload) {
    return this.auth.refresh(payload);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  logout(@Payload() payload: LogoutPayload) {
    return this.auth.logout(payload);
  }

  @MessagePattern(AUTH_PATTERNS.FORGOT_PASSWORD)
  forgotPassword(@Payload() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @MessagePattern(AUTH_PATTERNS.RESET_PASSWORD)
  resetPassword(@Payload() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @MessagePattern(AUTH_PATTERNS.GET_USER_BY_ID)
  getUserById(@Payload() payload: { userId: string }) {
    return this.auth.getUserById(payload);
  }

  @MessagePattern(AUTH_PATTERNS.GET_SESSION)
  getSession(@Payload() payload: { userId: string }) {
    return this.auth.getSession(payload);
  }

  @MessagePattern(ORG_PATTERNS.LIST_ORGS)
  listOrgs(@Payload() payload: { userId: string }) {
    return this.auth.listOrgs(payload);
  }

  @MessagePattern(WORKSPACE_PATTERNS.LIST_WORKSPACES)
  listWorkspaces(@Payload() payload: { userId: string }) {
    return this.auth.listWorkspaces(payload);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY_EMAIL)
  verifyEmail(@Payload() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @MessagePattern(AUTH_PATTERNS.RESEND_VERIFICATION)
  resendVerification(@Payload() payload: { userId: string }) {
    return this.auth.resendVerification(payload);
  }

  @MessagePattern(AUTH_PATTERNS.GOOGLE_LOGIN)
  googleLogin(@Payload() profile: GoogleProfile) {
    return this.auth.googleLogin(profile);
  }

  @MessagePattern(WORKSPACE_PATTERNS.VALIDATE_WORKSPACE_MEMBER)
  validateWorkspaceMember(
    @Payload() p: { userId: string; workspaceId: string },
  ) {
    return this.auth.validateWorkspaceMember(p);
  }
}
