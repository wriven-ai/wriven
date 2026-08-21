import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth.controller';
import { AuthorizationService } from './authorization.service';
import { AuthService } from './auth.service';
import { CleanupService } from './cleanup.service';
import { EntitlementsService } from './entitlements.service';
import { MailService } from './mail.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { TokenService } from './token.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceLogsService } from './workspace-logs.service';
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
    InvitationsController,
  ],
  providers: [
    AuthService,
    AuthorizationService,
    TokenService,
    MailService,
    CleanupService,
    MembersService,
    WorkspacesService,
    WorkspaceLogsService,
    ProjectsService,
    InvitationsService,
    EntitlementsService,
  ],
  exports: [AuthorizationService],
})
export class AuthModule {}
