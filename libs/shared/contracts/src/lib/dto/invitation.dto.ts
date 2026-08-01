import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';

const WORKSPACE_ASSIGNABLE = ['admin', 'member'] as const;
const PROJECT_ROLES = ['admin', 'editor', 'viewer'] as const;

const lowerEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateWorkspaceInvitationDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(WORKSPACE_ASSIGNABLE)
  role!: (typeof WORKSPACE_ASSIGNABLE)[number];
}

export class CreateProjectInvitationDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(PROJECT_ROLES)
  role!: (typeof PROJECT_ROLES)[number];
}
