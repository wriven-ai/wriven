import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CleanupService } from './cleanup.service';
import { MailService } from './mail.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { TokenService } from './token.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [
    AuthController,
    MembersController,
    WorkspacesController,
    ProjectsController,
  ],
  providers: [
    AuthService,
    TokenService,
    MailService,
    CleanupService,
    MembersService,
    WorkspacesService,
    ProjectsService,
  ],
})
export class AuthModule {}
