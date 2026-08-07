import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CORE_PATTERNS,
  CreateMediaDto,
  PresignUploadDto,
} from '@wriven/contracts';
import { MediaService } from './media.service';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @MessagePattern(CORE_PATTERNS.MEDIA_PRESIGN)
  presign(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: PresignUploadDto;
    },
  ) {
    return this.media.presign(p);
  }

  /** Profile photo presign (specs/18) — no media_assets row, user-scoped. */
  @MessagePattern(CORE_PATTERNS.AVATAR_PRESIGN)
  presignAvatar(
    @Payload() p: { userId: string; dto: PresignUploadDto },
  ) {
    return this.media.presignAvatar(p);
  }

  /** Best-effort orphan cleanup on avatar change/remove (specs/18). */
  @MessagePattern(CORE_PATTERNS.AVATAR_DELETE)
  deleteAvatar(@Payload() p: { key: string }) {
    return this.media.deleteAvatar(p);
  }

  @MessagePattern(CORE_PATTERNS.MEDIA_CREATE)
  create(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: CreateMediaDto;
    },
  ) {
    return this.media.create(p);
  }

  @MessagePattern(CORE_PATTERNS.MEDIA_LIST)
  list(
    @Payload()
    p: { workspaceId: string; projectId: string; page?: number; limit?: number },
  ) {
    return this.media.list(p);
  }

  @MessagePattern(CORE_PATTERNS.MEDIA_GET)
  get(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.media.get(p);
  }

  @MessagePattern(CORE_PATTERNS.MEDIA_DELETE)
  remove(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.media.remove(p);
  }

  @MessagePattern(CORE_PATTERNS.MEDIA_DELETE_BULK)
  removeMany(
    @Payload() p: { workspaceId: string; projectId: string; ids: string[] },
  ) {
    return this.media.removeMany(p);
  }
}
