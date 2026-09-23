import type {Command, Reply} from '../shared/messages.js';
import {isCommand, parseReply} from '../shared/messages.js';

// The callback-compatible chrome namespace is supported by both targets.
// Keep it here so API behavior can change without touching domain or UI code.
function call<T>(register: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    register(value => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message ?? 'Browser operation failed.'));
      } else {
        resolve(value);
      }
    });
  });
}

export function queryTabs(allWindows: boolean): Promise<chrome.tabs.Tab[]> {
  return call(callback => { chrome.tabs.query(allWindows ? {windowType: 'normal'} : {lastFocusedWindow: true, windowType: 'normal'}, callback); });
}

export function createWindow(): Promise<chrome.windows.Window | undefined> {
  return call(callback => { chrome.windows.create({url: 'about:blank', focused: false}, callback); });
}

export function createTab(windowId: number, url: string, pinned: boolean): Promise<chrome.tabs.Tab> {
  return call(callback => { chrome.tabs.create({windowId, url, pinned, active: false}, callback); });
}

export function removeTab(id: number): Promise<void> {
  return call(callback => { chrome.tabs.remove(id, callback); });
}

export function openLibrary(): Promise<chrome.tabs.Tab> {
  return call(callback => { chrome.tabs.create({url: chrome.runtime.getURL('ui/library.html')}, callback); });
}

/** Resolves undefined when the browser cannot report toolbar placement. */
export async function isActionPinned(): Promise<boolean | undefined> {
  if (typeof chrome.action.getUserSettings !== 'function') {
    return undefined;
  }
  const settings = await call<Partial<chrome.action.UserSettings>>(callback => { chrome.action.getUserSettings(callback); });
  return settings.isOnToolbar;
}

export function onActionPinned(handler: () => void): void {
  // Chrome 130+ only; older browsers keep the hint until the next page load.
  if (typeof chrome.action.onUserSettingsChanged !== 'object') {
    return;
  }
  chrome.action.onUserSettingsChanged.addListener(change => {
    if (change.isOnToolbar) {
      handler();
    }
  });
}

export function requestBookmarks(): Promise<boolean> {
  return call(callback => { chrome.permissions.request({permissions: ['bookmarks']}, callback); });
}

export function hasBookmarks(): Promise<boolean> {
  return call(callback => { chrome.permissions.contains({permissions: ['bookmarks']}, callback); });
}

export function bookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return call(callback => { chrome.bookmarks.getTree(callback); });
}

export function createBookmark(parentId: string, title: string, url: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return call(callback => { chrome.bookmarks.create({parentId, title, url}, callback); });
}

export function editBookmark(id: string, title: string, url: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return call(callback => { chrome.bookmarks.update(id, {title, url}, callback); });
}

export function removeBookmark(id: string): Promise<void> {
  return call(callback => { chrome.bookmarks.remove(id, callback); });
}

export async function sendCommand(command: Command): Promise<Reply> {
  const response = await call<unknown>(callback => { chrome.runtime.sendMessage(command, callback); });
  const reply = parseReply(response);
  if (!reply.ok) {
    throw new Error(reply.message);
  }
  return reply;
}

export function listen(handler: (command: Command) => Promise<Reply>): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (reply: Reply) => void) => {
    const allowedPages = ['ui/popup.html', 'ui/library.html'].map(path => chrome.runtime.getURL(path));
    if (sender.id !== chrome.runtime.id || sender.tab?.incognito ||
      !sender.url || !allowedPages.includes(sender.url) || !isCommand(message)) {
      return false;
    }
    handler(message).then(respond).catch((error: unknown) => {
      respond({
        ok: false,
        data: null,
        message: error instanceof Error ? error.message : 'Operation failed. Please retry.',
      });
    });
    return true;
  });
}
