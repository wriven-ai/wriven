import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** The UI offers exactly these windows; the segmented control is not the gate. */
export const WORKSPACE_LOG_WINDOWS = [7, 30, 90] as const;

/** Query for `GET /logs` — activity feed window + pagination. */
export class WorkspaceLogQueryDto {
  /** Feed cutoff = now − days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(WORKSPACE_LOG_WINDOWS)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
