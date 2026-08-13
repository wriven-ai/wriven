import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AI_PATTERNS,
  AiGenerateDto,
  AiProfileView,
  UpdateAiProfileDto,
} from '@wriven/contracts';
import { AiService } from './ai.service';
import { AiProfileService } from './ai-profile.service';

@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly profiles: AiProfileService,
  ) {}

  @MessagePattern(AI_PATTERNS.GENERATE)
  generate(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: AiGenerateDto;
    },
  ) {
    return this.ai.generate(p);
  }

  @MessagePattern(AI_PATTERNS.PROFILE_READ)
  readProfile(@Payload() p: { projectId: string }): Promise<AiProfileView> {
    return this.profiles.read(p.projectId);
  }

  @MessagePattern(AI_PATTERNS.PROFILE_UPDATE)
  updateProfile(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: UpdateAiProfileDto;
    },
  ): Promise<AiProfileView> {
    return this.profiles.upsert(p);
  }
}
