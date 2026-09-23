import {isRecord} from '../domain/session.js';
import {MAX_IMPORT_BYTES} from './limits.js';

export interface Command {
  type: 'list' | 'save' | 'restore' | 'rename' | 'favorite' | 'trash' | 'recover' | 'delete-permanently' | 'empty-trash' | 'import' | 'bookmarks' | 'bookmark-create' | 'bookmark-edit' | 'bookmark-delete';
  id: string;
  value: string;
}

export interface Reply {
  ok: boolean;
  data: unknown;
  message: string;
}

const commandTypes = new Set<string>([
  'list', 'save', 'restore', 'rename', 'favorite', 'trash', 'recover', 'delete-permanently', 'empty-trash', 'import',
  'bookmarks', 'bookmark-create', 'bookmark-edit', 'bookmark-delete',
]);

export function isCommand(value: unknown): value is Command {
  return isRecord(value) && typeof value.type === 'string' &&
    commandTypes.has(value.type) && typeof value.id === 'string' &&
    value.id.length <= 100 && typeof value.value === 'string' &&
    value.value.length <= MAX_IMPORT_BYTES &&
    new TextEncoder().encode(value.value).length <= MAX_IMPORT_BYTES;
}

export function isBookmarkCommand(type: Command['type']): boolean {
  return type === 'bookmarks' || type.startsWith('bookmark-');
}

export function parseReply(value: unknown): Reply {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.message !== 'string') {
    throw new Error('The extension returned an invalid response. Reload this page.');
  }
  return {ok: value.ok, data: value.data, message: value.message};
}
