import {captureWindows, countTabs, isRecord, isWebUrl, parseImport} from '../domain/session.js';
import type {Session} from '../domain/session.js';
import {parseBookmarkTree} from '../domain/bookmark.js';
import * as browser from '../platform/browser.js';
import {isBookmarkCommand} from '../shared/messages.js';
import type {Command, Reply} from '../shared/messages.js';
import {quantity} from '../shared/format.js';
import {MAX_NAME_LENGTH} from '../shared/limits.js';
import {deleteTrashedSessions, listLibrary, listSessions, putSessions, recordRestore} from '../storage/sessions.js';

function sessionName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new Error(`Use a session name between 1 and ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

async function restore(session: Session): Promise<string> {
  const operationId = crypto.randomUUID();
  let opened = 0;
  let failed = 0;
  await recordRestore(operationId, 'started', opened, failed);
  for (const savedWindow of session.windows) {
    let window: chrome.windows.Window | undefined;
    try {
      window = await browser.createWindow();
    } catch {
      failed += savedWindow.tabs.length;
      await recordRestore(operationId, 'running', opened, failed);
      continue;
    }
    if (window?.id === undefined) {
      failed += savedWindow.tabs.length;
      await recordRestore(operationId, 'running', opened, failed);
      continue;
    }
    let openedInWindow = 0;
    for (const tab of savedWindow.tabs) {
      try {
        await browser.createTab(window.id, tab.url, tab.pinned);
        opened++;
        openedInWindow++;
      } catch {
        failed++;
      }
      // A crash before this record commits leaves uncertainty; never auto-replay.
      await recordRestore(operationId, 'running', opened, failed);
    }
    const blankId = window.tabs?.[0]?.id;
    if (openedInWindow > 0 && blankId !== undefined) {
      try {
        await browser.removeTab(blankId);
      } catch {
        // A user may have closed the placeholder during restoration.
      }
    }
  }
  await recordRestore(operationId, 'finished', opened, failed);
  return `${quantity(opened, 'tab')} opened${failed ? `; ${quantity(failed, 'tab')} could not be opened` : ''}. Existing tabs were kept.`;
}

async function bookmarks(command: Command): Promise<Reply> {
  if (!await browser.hasBookmarks()) {
    throw new Error('Enable bookmark access to use this feature.');
  }
  if (command.type === 'bookmarks') {
    return {ok: true, data: await browser.bookmarkTree(), message: 'Bookmarks are up to date.'};
  }
  const tree = parseBookmarkTree(await browser.bookmarkTree());
  if (command.type === 'bookmark-create' || command.type === 'bookmark-edit') {
    const value: unknown = JSON.parse(command.value);
    if (!isRecord(value) || typeof value.title !== 'string' ||
      value.title.length > MAX_NAME_LENGTH || !isWebUrl(value.url)) {
      throw new Error('Enter a title and an HTTP or HTTPS bookmark URL.');
    }
    if (command.type === 'bookmark-create') {
      if (!tree.folders.some(folder => folder.id === command.id)) {
        throw new Error('Choose an existing bookmark folder.');
      }
      await browser.createBookmark(command.id, value.title, value.url);
    } else {
      if (!tree.bookmarks.some(bookmark => bookmark.id === command.id)) {
        throw new Error('This bookmark no longer exists. Refresh the library.');
      }
      await browser.editBookmark(command.id, value.title, value.url);
    }
  } else if (command.type === 'bookmark-delete') {
    if (!tree.bookmarks.some(bookmark => bookmark.id === command.id)) {
      throw new Error('This bookmark no longer exists. Refresh the library.');
    }
    await browser.removeBookmark(command.id);
  }
  return {ok: true, data: await browser.bookmarkTree(), message: 'Bookmarks are up to date.'};
}

export async function execute(command: Command): Promise<Reply> {
  if (isBookmarkCommand(command.type)) {
    return bookmarks(command);
  }
  let message = '';
  if (command.type === 'save') {
    const tabs = await browser.queryTabs(command.id === 'all');
    const windows = captureWindows(tabs);
    if (windows.length === 0) {
      throw new Error('No eligible HTTP or HTTPS tabs to save. Private tabs are excluded.');
    }
    const session: Session = {
      id: crypto.randomUUID(), name: sessionName(command.value), createdAt: Date.now(),
      favorite: false, deleted: false, windows,
    };
    await putSessions([session]);
    message = `Saved ${countTabs(session)} tabs. ${tabs.length - countTabs(session)} unsupported or private tabs excluded.`;
  } else if (command.type === 'import') {
    const imported = parseImport(command.value).map(session => ({
      ...session, id: crypto.randomUUID(), createdAt: Date.now(), deleted: false,
    }));
    await putSessions(imported);
    message = `Imported ${imported.length} sessions as new copies.`;
  } else if (command.type === 'delete-permanently') {
    await deleteTrashedSessions(command.id);
    message = 'Session permanently deleted.';
  } else if (command.type === 'empty-trash') {
    await deleteTrashedSessions();
    message = 'Trash emptied.';
  } else if (command.type !== 'list') {
    const sessions = await listSessions();
    const session = sessions.find(item => item.id === command.id);
    if (!session) {
      throw new Error('This session no longer exists. Refresh the library.');
    }
    switch (command.type) {
      case 'restore':
        if (session.deleted) {
          throw new Error('Recover this session from Trash before opening it.');
        }
        message = await restore(session);
        break;
      case 'rename':
        await putSessions([{...session, name: sessionName(command.value)}]);
        message = 'Session renamed.';
        break;
      case 'favorite':
        await putSessions([{...session, favorite: !session.favorite}]);
        message = 'Favorite updated.';
        break;
      case 'trash':
      case 'recover':
        await putSessions([{...session, deleted: command.type === 'trash'}]);
        message = command.type === 'trash' ? 'Moved to Trash. You can recover it there.' : 'Session recovered.';
        break;
      default:
        throw new Error('Unsupported command.');
    }
  }
  const library = await listLibrary();
  if (library.unreadable > 0) {
    const notice = `${quantity(library.unreadable, 'unreadable session')} hidden. Empty Trash to remove ${library.unreadable === 1 ? 'it' : 'them'}.`;
    message = message ? `${message} ${notice}` : notice;
  }
  return {ok: true, data: library.sessions, message};
}
