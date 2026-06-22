import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@wriven/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern(AUTH_PATTERNS.PING)
  ping() {
    return this.appService.ping();
  }
}
