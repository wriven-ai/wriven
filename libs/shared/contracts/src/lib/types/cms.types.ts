/** Field types a content type can declare. */
export type FieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'media'
  | 'select'
  | 'reference';

export const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'richtext',
  'number',
  'boolean',
  'date',
  'media',
  'select',
  'reference',
];

/** One user-defined field within a content type. */
export interface FieldDef {
  /** Machine key used in entry `data` (e.g. "title"). */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** App-enforced uniqueness within the content type. */
  unique?: boolean;
  /** Allow an array of values (media, reference, select). */
  multiple?: boolean;
  /** Allowed values for `select`. */
  options?: string[];
  /** Target content type id for `reference`. */
  refTypeId?: string;
  /**
   * Sensitive data: never send this field to an AI provider, as target or
   * context. The only AI control an author configures per field — eligibility is
   * otherwise derived (Tier-1 type, single-value, not sensitive).
   */
  aiPrivate?: boolean;
  /** Explicit sibling-field allowlist used as context for this AI target. */
  aiContextFields?: string[];
}

export type EntryStatus = 'draft' | 'published' | 'archived';

/** A stored snapshot of an entry's data at a point in time. */
export interface RevisionView {
  id: string;
  entryId: string;
  version: number;
  status: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface ContentTypeView {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  apiId: string;
  fields: FieldDef[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentEntryView {
  id: string;
  workspaceId: string;
  projectId: string;
  contentTypeId: string;
  slug: string;
  status: EntryStatus;
  data: Record<string, unknown>;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaView {
  id: string;
  workspaceId: string;
  projectId: string;
  /** Public URL reconstructed from the stored object key at read time. */
  url: string;
  kind: string;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  originalFilename: string | null;
  createdAt: string;
}

/** Result of requesting a presigned upload — browser PUTs the file to `uploadUrl`. */
export interface PresignResult {
  uploadUrl: string;
  /** The object key to send back when creating the media row. */
  key: string;
}

/** Max upload size by kind, in bytes. Shared by client guard + server presign check. */
export const MEDIA_MAX_BYTES = {
  image: 5 * 1024 * 1024, // 5 MB
  other: 25 * 1024 * 1024, // 25 MB (video / documents)
} as const;

/** Resolve the max upload size (bytes) for a given content-type. */
export const maxBytesForContentType = (contentType: string): number =>
  contentType.startsWith('image/') ? MEDIA_MAX_BYTES.image : MEDIA_MAX_BYTES.other;

/** Total media storage allowed per workspace, in bytes (R2 free-tier budget). */
export const WORKSPACE_MEDIA_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB

/** Public, resolved shape of a `media` field value in a Delivery API response. */
export interface DeliveryMedia {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
}

/** Paginated list envelope returned to the gateway. */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Public, published-only shape returned by the Content Delivery API. Trimmed of
 * internal author/workspace ids. `reference` field values may be expanded inline
 * to nested `DeliveryEntry` objects when `include` is requested; otherwise they
 * remain the referenced entry id.
 */
export interface DeliveryEntry {
  id: string;
  /** The content type's `apiId`, e.g. "blog_post". */
  type: string;
  slug: string;
  data: Record<string, unknown>;
  publishedAt: string | null;
  updatedAt: string;
}
