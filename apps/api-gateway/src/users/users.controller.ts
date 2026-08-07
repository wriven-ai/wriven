import {
  Body,
  Controller,
  Inject,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  AUTH_PATTERNS,
  CORE_PATTERNS,
  PresignUploadDto,
  SERVICE_TOKENS,
  UpdateProfileDto,
  UserView,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Self-service account routes (specs/18). User-scoped — no workspace/project
 * context. CSRF is enforced globally (`CsrfGuard` in `main.ts`), so the
 * mutating `PATCH /users/me` is protected automatically; the SPA already echoes
 * the double-submit token on writes.
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  /**
   * Update the authed user's display name and/or avatar (R2 key / null).
   * After a successful avatar change/remove, best-effort deletes the prior R2
   * object via core (specs/18). External (Google) URLs + null are skipped; a
   * failed delete never fails the PATCH.
   */
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserView> {
    const result = await firstValueFrom(
      this.auth.send(AUTH_PATTERNS.UPDATE_PROFILE, { userId: user.userId, dto }),
    ) as { user: UserView; previousAvatarKey: string | null };

    const prev = result.previousAvatarKey;
    if (prev && !/^https?:\/\//i.test(prev)) {
      // Orphan cleanup — fire and forget. A failure must not break the update.
      firstValueFrom(
        this.core.send(CORE_PATTERNS.AVATAR_DELETE, { key: prev }),
      ).catch(() => undefined);
    }
    return result.user;
  }

  /** Issue a presigned R2 PUT URL + object key for a new profile photo. */
  @Post('me/avatar-presign')
  avatarPresign(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignUploadDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.AVATAR_PRESIGN, { userId: user.userId, dto }),
    );
  }
}
