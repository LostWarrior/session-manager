import {element} from '../dom.js';

export function emptyState(searching: boolean, bookmarks: boolean): HTMLElement {
  const empty = element('div', '', 'empty');
  empty.append(element('h2', searching ? 'Nothing matches yet.' : 'A little room for later.'));
  let description = 'Save your open tabs, then return whenever you’re ready.';
  if (searching) {
    description = 'Try a different title or URL.';
  } else if (bookmarks) {
    description = 'Enable access or add a bookmark to get started.';
  }
  empty.append(element('p', description));
  return empty;
}
