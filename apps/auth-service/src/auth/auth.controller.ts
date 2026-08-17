import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  ForgotPasswordDto,
  type GoogleProfile,
  LoginDto,
  type LogoutPayload,
  PROJECT_PATTERNS,
  type RefreshPayload,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { AuthService } from './auth.service';
import { EntitlementsService } from './entitlements.service';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @MessagePattern(AUTH_PATTERNS.ENTITLEMENTS_RESOLVE)
  resolveEntitlements(@Payload() payload: { workspaceId: string }) {
    return this.entitlements.resolve(payload);
  }

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

  @MessagePattern(AUTH_PATTERNS.UPDATE_PROFILE)
  updateProfile(
    @Payload() payload: { userId: string; dto: UpdateProfileDto },
  ) {
    return this.auth.updateProfile(payload);
  }

  @MessagePattern(WORKSPACE_PATTERNS.VALIDATE_WORKSPACE_MEMBER)
  validateWorkspaceMember(
    @Payload() p: { userId: string; workspaceId: string },
  ) {
    return this.auth.validateWorkspaceMember(p);
  }

  @MessagePattern(PROJECT_PATTERNS.VALIDATE_PROJECT_MEMBER)
  validateProjectMember(@Payload() p: { userId: string; projectId: string }) {
    return this.auth.validateProjectMember(p);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY_EMAIL)
  verifyEmail(@Payload() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY_EMAIL_CODE)
  verifyEmailCode(@Payload() payload: { userId: string; code: string }) {
    return this.auth.verifyEmailCode(payload);
  }

  @MessagePattern(AUTH_PATTERNS.RESEND_VERIFICATION)
  resendVerification(@Payload() payload: { userId: string }) {
    return this.auth.resendVerification(payload);
  }

  @MessagePattern(AUTH_PATTERNS.GOOGLE_LOGIN)
  googleLogin(@Payload() profile: GoogleProfile) {
    return this.auth.googleLogin(profile);
  }
}
