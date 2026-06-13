import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';

const ORG_ROLES = ['owner', 'admin', 'member'] as const;
const ORG_ASSIGNABLE = ['admin', 'member'] as const; // owner not granted via add
const WORKSPACE_ROLES = ['admin', 'editor', 'viewer'] as const;

const lowerEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AddOrgMemberDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(ORG_ASSIGNABLE)
  role!: (typeof ORG_ASSIGNABLE)[number];
}

export class UpdateOrgMemberDto {
  @IsIn(ORG_ROLES)
  role!: (typeof ORG_ROLES)[number];
}

export class AddWorkspaceMemberDto {
  @IsEmail()
  @Transform(lowerEmail)
  email!: string;

  @IsIn(WORKSPACE_ROLES)
  role!: (typeof WORKSPACE_ROLES)[number];
}

export class UpdateWorkspaceMemberDto {
  @IsIn(WORKSPACE_ROLES)
  role!: (typeof WORKSPACE_ROLES)[number];
}
