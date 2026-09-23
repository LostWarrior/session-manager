import {captureWindows, isRecord, isSession, parseExportValue, truncate} from './session.js';
import type {CaptureTab, Session} from './session.js';
import {MAX_NAME_LENGTH} from '../shared/limits.js';

export interface ImportFile {
  sessions: Session[];
  /** Foreign sessions left out because no valid, non-private tabs remained or limits were exceeded. */
  skipped: number;
}

function captureTab(value: unknown): CaptureTab | undefined {
  if (!isRecord(value) || typeof value.windowId !== 'number' || typeof value.index !== 'number' ||
    typeof value.url !== 'string') {
    return undefined;
  }
  return {
    windowId: value.windowId,
    index: value.index,
    // Unknown privacy status is treated as private so it is never imported.
    incognito: value.incognito !== false,
    pinned: value.pinned === true,
    url: value.url,
    title: typeof value.title === 'string' ? value.title : undefined,
  };
}

/**
 * Converts a Tab Session Manager export: an array of sessions whose `windows` map
 * window IDs to maps of tab IDs to browser tab objects.
 */
function fromTabSessionManager(value: readonly unknown[]): ImportFile {
  const sessions: Session[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || !isRecord(item.windows)) {
      continue;
    }
    const tabs = Object.values(item.windows).flatMap(tabMap => isRecord(tabMap) ? Object.values(tabMap) : [])
      .map(captureTab).filter(tab => tab !== undefined);
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Imported session ${index + 1}`;
    const session: Session = {
      id: `tab-session-manager-${index}`,
      name: truncate(name, MAX_NAME_LENGTH),
      createdAt: typeof item.date === 'number' && Number.isFinite(item.date) ? item.date : 0,
      favorite: false,
      deleted: false,
      windows: captureWindows(tabs),
    };
    if (isSession(session)) {
      sessions.push(session);
    }
  }
  return {sessions, skipped: value.length - sessions.length};
}

/** Parses this extension's exports and supported exports from other session managers. */
export function parseImportFile(text: string): ImportFile {
  const value: unknown = JSON.parse(text);
  if (Array.isArray(value)) {
    return fromTabSessionManager(value);
  }
  return {sessions: parseExportValue(value), skipped: 0};
}
