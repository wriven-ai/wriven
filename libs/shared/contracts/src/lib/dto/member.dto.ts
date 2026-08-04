import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';
import {
  PROJECT_ROLES,
  WORKSPACE_ASSIGNABLE_ROLES,
  WORKSPACE_ROLES,
} from '../types/rbac.types';

const lowerEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AddWorkspaceMemberDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(WORKSPACE_ASSIGNABLE_ROLES)
  role!: (typeof WORKSPACE_ASSIGNABLE_ROLES)[number];
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
