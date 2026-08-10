import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AI_PATTERNS, type AiGenerateDto } from '@wriven/contracts';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

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
}
