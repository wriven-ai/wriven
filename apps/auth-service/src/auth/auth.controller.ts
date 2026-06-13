import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  ForgotPasswordDto,
  LoginDto,
  LogoutPayload,
  RefreshPayload,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
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

  @MessagePattern(AUTH_PATTERNS.VERIFY_EMAIL)
  verifyEmail(@Payload() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @MessagePattern(AUTH_PATTERNS.RESEND_VERIFICATION)
  resendVerification(@Payload() payload: { userId: string }) {
    return this.auth.resendVerification(payload);
  }
}
