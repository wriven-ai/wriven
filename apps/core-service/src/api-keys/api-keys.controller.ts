import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CORE_PATTERNS, CreateApiKeyDto } from '@wriven/contracts';
import { ApiKeysService } from './api-keys.service';

@Controller()
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @MessagePattern(CORE_PATTERNS.API_KEY_CREATE)
  create(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: CreateApiKeyDto;
    },
  ) {
    return this.keys.create(p);
  }

  @MessagePattern(CORE_PATTERNS.API_KEY_LIST)
  list(@Payload() p: { workspaceId: string; projectId: string }) {
    return this.keys.list(p);
  }

  @MessagePattern(CORE_PATTERNS.API_KEY_REGENERATE)
  regenerate(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.keys.regenerate(p);
  }

  @MessagePattern(CORE_PATTERNS.API_KEY_REVOKE)
  revoke(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.keys.revoke(p);
  }

  @MessagePattern(CORE_PATTERNS.API_KEY_RESOLVE)
  resolve(@Payload() p: { token: string }) {
    return this.keys.resolve(p);
  }
}
