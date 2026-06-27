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
}

export type EntryStatus = 'draft' | 'published' | 'archived';

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
  r2Key: string;
  kind: string;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  originalFilename: string | null;
  createdAt: string;
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
