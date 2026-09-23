import type {Bookmark} from '../../domain/bookmark.js';
import {isWebUrl} from '../../domain/session.js';
import type {ActionHandler} from '../actions.js';
import {element} from '../dom.js';
import {actionButton, externalLink} from './controls.js';

export function bookmarkRow(bookmark: Bookmark, onAction: ActionHandler): HTMLElement {
  const row = element('article', '', 'bookmark');
  const top = element('div', '', 'bookmark-top');
  top.append(element('h2', bookmark.title || bookmark.url), element('p', bookmark.folder, 'meta'));
  row.append(top, element('p', bookmark.url, 'url'));
  const actions = element('div', '', 'actions');
  actions.append(actionButton('Edit', () => {
    const title = prompt('Bookmark title', bookmark.title);
    if (title === null) {
      return;
    }
    const url = prompt('Bookmark URL', bookmark.url);
    if (url !== null) {
      onAction('bookmark-edit', bookmark.id, JSON.stringify({title, url}));
    }
  }));
  actions.append(actionButton('Delete', () => {
    if (confirm(`Delete “${bookmark.title}” from ${bookmark.folder}? This also deletes it from the browser's bookmarks.`)) {
      onAction('bookmark-delete', bookmark.id);
    }
  }));
  if (isWebUrl(bookmark.url)) {
    actions.append(externalLink('Open bookmark', bookmark.url));
  }
  row.append(actions);
  return row;
}
