import { Controller, Get } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CORE_PATTERNS } from '@wriven/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'core-service' };
  }

  @MessagePattern(CORE_PATTERNS.PING)
  ping() {
    return this.appService.ping();
  }
}
