import {MAX_IMPORT_BYTES, MAX_IMPORT_SESSIONS, MAX_IMPORT_TABS, MAX_NAME_LENGTH, MAX_TAB_TITLE_LENGTH, MAX_URL_LENGTH} from '../shared/limits.js';

export interface SavedTab {
  url: string;
  title: string;
  pinned: boolean;
}

export interface SavedWindow {
  tabs: SavedTab[];
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  favorite: boolean;
  deleted: boolean;
  windows: SavedWindow[];
}

export interface CaptureTab {
  windowId: number;
  index: number;
  incognito: boolean;
  pinned: boolean;
  url?: string | undefined;
  title?: string | undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  // Avoid leaving a lone high surrogate at the cut.
  const end = /[\uD800-\uDBFF]/.test(value.charAt(maxLength - 1)) ? maxLength - 1 : maxLength;
  return value.slice(0, end);
}

export function captureWindows(tabs: readonly CaptureTab[]): SavedWindow[] {
  const windows = new Map<number, SavedTab[]>();
  for (const tab of [...tabs].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    if (tab.incognito || !isWebUrl(tab.url)) {
      continue;
    }
    const saved = windows.get(tab.windowId) ?? [];
    // Page-controlled titles are truncated so one tab cannot block saving the session.
    saved.push({url: tab.url, title: truncate(tab.title ?? tab.url, MAX_TAB_TITLE_LENGTH), pinned: tab.pinned});
    windows.set(tab.windowId, saved);
  }
  return [...windows.values()].map(windowTabs => ({tabs: windowTabs}));
}

export function countTabs(session: Session): number {
  return session.windows.reduce((count, window) => count + window.tabs.length, 0);
}

function isSavedTab(value: unknown): value is SavedTab {
  return isRecord(value) && isWebUrl(value.url) &&
    typeof value.title === 'string' && value.title.length <= MAX_TAB_TITLE_LENGTH &&
    typeof value.pinned === 'boolean';
}

export function isSession(value: unknown): value is Session {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length > 100 ||
    typeof value.name !== 'string' || value.name.length === 0 || value.name.length > MAX_NAME_LENGTH ||
    typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) ||
    typeof value.favorite !== 'boolean' || typeof value.deleted !== 'boolean' ||
    !Array.isArray(value.windows) || value.windows.length === 0 || value.windows.length > 100) {
    return false;
  }
  return value.windows.every((window: unknown) => isRecord(window) &&
    Array.isArray(window.tabs) && window.tabs.length > 0 &&
    window.tabs.length <= 1000 && window.tabs.every(isSavedTab));
}

export function parseSessions(value: unknown): Session[] {
  if (!Array.isArray(value) || !value.every(isSession)) {
    throw new Error('Invalid session data. Existing data has been preserved.');
  }
  return value;
}

/** Validates an export file of any size; batch limits are enforced by `parseImport`. */
export function parseExport(text: string): Session[] {
  return parseExportValue(JSON.parse(text));
}

/** Validates this extension's export format after JSON parsing. */
export function parseExportValue(value: unknown): Session[] {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Unsupported export format.');
  }
  return parseSessions(value.sessions);
}

export function parseImport(text: string): Session[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error('Choose an export smaller than 5 MB.');
  }
  const sessions = parseExport(text);
  if (sessions.length > MAX_IMPORT_SESSIONS) {
    throw new Error('Import at most 10,000 sessions at once.');
  }
  if (sessions.reduce((count, session) => count + countTabs(session), 0) > MAX_IMPORT_TABS) {
    throw new Error('Import at most 10,000 tabs at once.');
  }
  return sessions;
}
