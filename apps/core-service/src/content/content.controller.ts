import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CORE_PATTERNS,
  CreateContentTypeDto,
  CreateEntryDto,
  ListEntriesQueryDto,
  UpdateContentTypeDto,
  UpdateEntryDto,
} from '@wriven/contracts';
import { ContentTypesService } from './content-types.service';
import { EntriesService } from './entries.service';

@Controller()
export class ContentController {
  constructor(
    private readonly types: ContentTypesService,
    private readonly entries: EntriesService,
  ) {}

  // ── Content types ───────────────────────────────────────────────────────────

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_CREATE)
  createType(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: CreateContentTypeDto;
    },
  ) {
    return this.types.create(p);
  }

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_LIST)
  listTypes(
    @Payload() p: { workspaceId: string; projectId: string },
  ) {
    return this.types.list(p);
  }

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_GET)
  getType(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.types.get(p);
  }

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_UPDATE)
  updateType(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      id: string;
      dto: UpdateContentTypeDto;
    },
  ) {
    return this.types.update(p);
  }

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_DELETE)
  deleteType(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.types.remove(p);
  }

  @MessagePattern(CORE_PATTERNS.CONTENT_TYPE_SEED)
  seedTypes(
    @Payload() p: { workspaceId: string; projectId: string; userId: string },
  ) {
    return this.types.seedDefaults(p);
  }

  // ── Entries ───────────────────────────────────────────────────────────────

  @MessagePattern(CORE_PATTERNS.ENTRY_CREATE)
  createEntry(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: CreateEntryDto;
    },
  ) {
    return this.entries.create(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_LIST)
  listEntries(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      query: ListEntriesQueryDto;
    },
  ) {
    return this.entries.list(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_GET)
  getEntry(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.entries.get(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_UPDATE)
  updateEntry(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      id: string;
      dto: UpdateEntryDto;
    },
  ) {
    return this.entries.update(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_PUBLISH)
  publishEntry(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      id: string;
    },
  ) {
    return this.entries.publish(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_DELETE)
  deleteEntry(
    @Payload() p: { workspaceId: string; projectId: string; id: string },
  ) {
    return this.entries.remove(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_REVISIONS)
  listRevisions(
    @Payload() p: { workspaceId: string; projectId: string; entryId: string },
  ) {
    return this.entries.listRevisions(p);
  }

  @MessagePattern(CORE_PATTERNS.ENTRY_REVISION_RESTORE)
  restoreRevision(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      entryId: string;
      version: number;
    },
  ) {
    return this.entries.restoreRevision(p);
  }
}
