import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';

const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
const WORKSPACE_ASSIGNABLE = ['admin', 'member'] as const; // owner not granted via add
const PROJECT_ROLES = ['admin', 'editor', 'viewer'] as const;

const lowerEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AddWorkspaceMemberDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(WORKSPACE_ASSIGNABLE)
  role!: (typeof WORKSPACE_ASSIGNABLE)[number];
}

export class UpdateWorkspaceMemberDto {
  @IsIn(WORKSPACE_ROLES)
  role!: (typeof WORKSPACE_ROLES)[number];
}

export class AddProjectMemberDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(PROJECT_ROLES)
  role!: (typeof PROJECT_ROLES)[number];
}

export class UpdateProjectMemberDto {
  @IsIn(PROJECT_ROLES)
  role!: (typeof PROJECT_ROLES)[number];
}
