import {isRecord} from './session.js';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
}

export interface BookmarkFolder {
  id: string;
  path: string;
}

export interface BookmarkLibrary {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
}

export function parseBookmarkTree(value: unknown): BookmarkLibrary {
  const library: BookmarkLibrary = {bookmarks: [], folders: []};
  function visit(nodes: unknown, parent: string): void {
    if (!Array.isArray(nodes)) {
      throw new Error('Invalid bookmark response.');
    }
    for (const node of nodes) {
      if (!isRecord(node) || typeof node.id !== 'string' || typeof node.title !== 'string') {
        throw new Error('Invalid bookmark response.');
      }
      if (node.type === 'separator') {
        continue;
      }
      if (typeof node.url === 'string') {
        library.bookmarks.push({id: node.id, title: node.title, url: node.url, folder: parent});
        continue;
      }
      const path = [parent, node.title].filter(Boolean).join(' / ');
      if (node.parentId && !node.unmodifiable) {
        library.folders.push({id: node.id, path});
      }
      if (node.children) {
        visit(node.children, path);
      }
    }
  }
  visit(value, '');
  return library;
}
