import { FieldDef } from '@wriven/contracts';
import { rpcError } from '../common/rpc-error';

function fail(message: string): never {
  throw rpcError('VALIDATION_ERROR', message);
}

function checkScalar(field: FieldDef, value: unknown): void {
  switch (field.type) {
    case 'text':
    case 'richtext':
      if (typeof value !== 'string') fail(`Field "${field.key}" must be a string.`);
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value))
        fail(`Field "${field.key}" must be a number.`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail(`Field "${field.key}" must be a boolean.`);
      break;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
        fail(`Field "${field.key}" must be an ISO date string.`);
      break;
    case 'media':
    case 'reference':
      if (typeof value !== 'string')
        fail(`Field "${field.key}" must be an id string.`);
      break;
    case 'select':
      if (typeof value !== 'string') fail(`Field "${field.key}" must be a string.`);
      if (field.options && !field.options.includes(value as string))
        fail(`Field "${field.key}" must be one of: ${field.options.join(', ')}.`);
      break;
    default:
      fail(`Field "${field.key}" has an unknown type.`);
  }
}

/**
 * Validate entry `data` against a content type's field definitions:
 * rejects unknown keys, enforces required, type, options, and `multiple`.
 */
export function validateEntryData(
  fields: FieldDef[],
  data: Record<string, unknown>,
): void {
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) fail(`Unknown field "${key}".`);
  }

  for (const field of fields) {
    const value = data[field.key];
    const missing = value === undefined || value === null;

    if (missing) {
      if (field.required) fail(`Field "${field.key}" is required.`);
      continue;
    }

    if (field.multiple) {
      if (!Array.isArray(value)) fail(`Field "${field.key}" must be an array.`);
      (value as unknown[]).forEach((item) => checkScalar(field, item));
    } else {
      checkScalar(field, value);
    }
  }
}
