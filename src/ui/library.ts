import {parseSessions} from '../domain/session.js';
import {parseBookmarkTree} from '../domain/bookmark.js';
import type {Bookmark} from '../domain/bookmark.js';
import {bookmarkRow} from './components/bookmark-row.js';
import {sessionRow} from './components/session-row.js';
import {emptyState} from './components/empty-state.js';
import {setupTransfer} from './transfer.js';
import type {Session} from '../domain/session.js';
import {hasBookmarks, requestBookmarks, sendCommand} from '../platform/browser.js';
import type {Command} from '../shared/messages.js';
import {isBookmarkCommand} from '../shared/messages.js';
import {MAX_NAME_LENGTH, MAX_URL_LENGTH} from '../shared/limits.js';
import {element, getElement, getInput, getSelect, run} from './dom.js';
import {setupPinHint} from './pin.js';

let sessions: Session[] = [];
let view = 'sessions';
let bookmarks: Bookmark[] = [];

async function update(type: Command['type'], id = '', value = ''): Promise<void> {
  const reply = await sendCommand({type, id, value});
  if (isBookmarkCommand(type)) {
    const library = parseBookmarkTree(reply.data);
    bookmarks = library.bookmarks;
    const folders = getSelect('bookmark-folder');
    folders.replaceChildren(...library.folders.map(folder => {
      const option = element('option', folder.path);
      option.value = folder.id;
      return option;
    }));
  } else {
    sessions = parseSessions(reply.data);
  }
  render();
  getElement('status').textContent = reply.message;
}

function perform(type: Command['type'], id = '', value = ''): void {
  // Capture focus before run disables the initiating button, which blurs it.
  const previousFocus = document.activeElement;
  run(async () => {
    await update(type, id, value);
    if (previousFocus instanceof HTMLElement && !previousFocus.isConnected) {
      getElement('heading').focus();
    }
  });
}

const PAGE_SIZE = 50;
// Keyed by object identity; replaced data drops its cached text automatically.
const searchText = new WeakMap<object, string>();

function cachedText<T extends object>(item: T, build: (item: T) => string): string {
  let text = searchText.get(item);
  if (text === undefined) {
    text = build(item).toLocaleLowerCase();
    searchText.set(item, text);
  }
  return text;
}

function sessionText(session: Session): string {
  return `${session.name} ${session.windows.flatMap(window => window.tabs.map(tab => `${tab.title} ${tab.url}`)).join(' ')}`;
}

function bookmarkText(bookmark: Bookmark): string {
  return `${bookmark.title} ${bookmark.url} ${bookmark.folder}`;
}

/** Appends rows a page at a time, with a button that reveals the next page. */
function renderPaged<T>(container: HTMLElement, matches: readonly T[], row: (item: T) => HTMLElement): void {
  let shown = 0;
  const more = element('button', '', 'show-more');
  more.type = 'button';
  const showPage = (): void => {
    const rows = matches.slice(shown, shown + PAGE_SIZE).map(row);
    shown += rows.length;
    more.before(...rows);
    const remaining = matches.length - shown;
    more.textContent = `Show ${Math.min(remaining, PAGE_SIZE)} more of ${remaining} remaining`;
    if (remaining === 0) {
      // Keep keyboard focus in the list when the focused button disappears.
      const hadFocus = document.activeElement === more;
      more.remove();
      if (hadFocus) {
        rows[0]?.querySelector<HTMLElement>('button, a, summary')?.focus();
      }
    }
  };
  more.addEventListener('click', showPage);
  container.append(more);
  showPage();
}

function render(): void {
  getElement('empty-trash').hidden = view !== 'trash';
  const query = getInput('search').value.toLocaleLowerCase();
  const items = getElement('items');
  items.replaceChildren();
  if (view === 'bookmarks') {
    const matches = bookmarks.filter(item => cachedText(item, bookmarkText).includes(query));
    renderPaged(items, matches, bookmark => bookmarkRow(bookmark, perform));
  } else {
    const matches = sessions.filter(item => item.deleted === (view === 'trash') &&
      (view !== 'favorites' || item.favorite) && cachedText(item, sessionText).includes(query));
    renderPaged(items, matches, session => sessionRow(session, perform));
  }
  if (!items.childElementCount) {
    items.append(emptyState(Boolean(query), view === 'bookmarks'));
  }
}

/** Shows or hides the add-bookmark form behind its disclosure button. */
function setBookmarkFormOpen(open: boolean, moveFocus = false): void {
  const toggle = getElement('add-bookmark');
  getElement('bookmark-form').hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (moveFocus) {
    (open ? getInput('bookmark-title') : toggle).focus();
  }
}

async function refresh(): Promise<void> {
  getElement('add-bookmark').hidden = true;
  setBookmarkFormOpen(false);
  if (view === 'bookmarks') {
    const granted = await hasBookmarks();
    getElement('enable-bookmarks').hidden = granted;
    getElement('add-bookmark').hidden = !granted;
    if (!granted) {
      bookmarks = [];
      render();
      getElement('status').textContent = 'Bookmark access is optional. Sessions work without it.';
      return;
    }
  }
  await update(view === 'bookmarks' ? 'bookmarks' : 'list');
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(nav => {
  nav.addEventListener('click', () => {
    run(async () => {
      view = nav.dataset.view ?? 'sessions';
      document.querySelectorAll('[data-view]').forEach(item => { item.removeAttribute('aria-current'); });
      nav.setAttribute('aria-current', 'page');
      getElement('heading').textContent = view === 'sessions' ? 'Your sessions' : nav.textContent;
      getElement('bookmark-tools').hidden = view !== 'bookmarks';
      getInput('search').value = '';
      await refresh();
    });
  });
});
getInput('search').addEventListener('input', render);
getElement('refresh').addEventListener('click', () => { run(refresh); });
getElement('empty-trash').addEventListener('click', () => {
  if (confirm('Permanently delete all sessions in Trash and their saved URLs, including those hidden by search or unreadable? This cannot be undone.')) {
    perform('empty-trash');
  }
});
getElement('save').addEventListener('click', () => {
  const name = prompt('Save all regular windows as', `Session · ${new Date().toLocaleDateString()}`);
  if (name !== null) {
    run(() => update('save', 'all', name));
  }
});
getElement('enable-bookmarks').addEventListener('click', () => {
  // Permission request starts synchronously within the user's click gesture.
  const permission = requestBookmarks();
  run(async () => {
    if (!await permission) {
      throw new Error('Bookmark access was not granted. You can enable it later.');
    }
    await refresh();
  });
});
getElement('bookmark-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    await update('bookmark-create', getSelect('bookmark-folder').value, JSON.stringify({
      title: getInput('bookmark-title').value, url: getInput('bookmark-url').value,
    }));
    getInput('bookmark-title').value = '';
    getInput('bookmark-url').value = '';
    setBookmarkFormOpen(false, true);
  });
});
getElement('add-bookmark').addEventListener('click', () => {
  setBookmarkFormOpen(getElement('add-bookmark').getAttribute('aria-expanded') !== 'true', true);
});
getElement('cancel-bookmark').addEventListener('click', () => { setBookmarkFormOpen(false, true); });
setupTransfer(update);
getInput('bookmark-title').maxLength = MAX_NAME_LENGTH;
getInput('bookmark-url').maxLength = MAX_URL_LENGTH;
void setupPinHint('pin-hint');
run(refresh);
