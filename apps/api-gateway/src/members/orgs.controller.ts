import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AddOrgMemberDto,
  AuthUser,
  ORG_PATTERNS,
  SERVICE_TOKENS,
  UpdateOrgMemberDto,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrgsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get(':orgId/members')
  list(@CurrentUser() user: AuthUser, @Param('orgId') orgId: string) {
    return firstValueFrom(
      this.auth.send(ORG_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        orgId,
      }),
    );
  }

  @Post(':orgId/members')
  add(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Body() dto: AddOrgMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(ORG_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        orgId,
        dto,
      }),
    );
  }

  @Patch(':orgId/members/:userId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateOrgMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(ORG_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        orgId,
        targetUserId,
        dto,
      }),
    );
  }

  @Delete(':orgId/members/:userId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('userId') targetUserId: string,
  ) {
    return firstValueFrom(
      this.auth.send(ORG_PATTERNS.REMOVE_MEMBER, {
        callerUserId: user.userId,
        orgId,
        targetUserId,
      }),
    );
  }
}
