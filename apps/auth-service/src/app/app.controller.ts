import { Controller, Get } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@wriven/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'auth-service' };
  }

  @MessagePattern(AUTH_PATTERNS.PING)
  ping() {
    return this.appService.ping();
  }
}
