import {countTabs, truncate} from './session.js';
import type {SavedWindow, Session} from './session.js';
import {MAX_IMPORT_BYTES, MAX_IMPORT_SESSIONS, MAX_IMPORT_TABS, MAX_NAME_LENGTH} from '../shared/limits.js';

// Headroom for the export envelope and part-name suffixes, both far smaller than this.
const PART_BYTES = MAX_IMPORT_BYTES - 4096;
const encoder = new TextEncoder();

function byteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

function partName(name: string, part: number, total: number): string {
  const suffix = ` (part ${part} of ${total})`;
  return `${truncate(name, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
}

/** Splits a session that alone exceeds import limits into sessions that each fit. */
function splitSession(session: Session): Session[] {
  const baseBytes = byteLength({...session, windows: []});
  const pieces: SavedWindow[][] = [];
  let windows: SavedWindow[] = [];
  let tabs = 0;
  let bytes = baseBytes;
  for (const savedWindow of session.windows) {
    let current: SavedWindow | undefined;
    for (const tab of savedWindow.tabs) {
      // Tab bytes plus a comma; a new window adds its wrapper and a comma.
      const tabBytes = byteLength(tab) + 1 + (current ? 0 : byteLength({tabs: []}) + 1);
      if (tabs > 0 && (tabs + 1 > MAX_IMPORT_TABS || bytes + tabBytes > PART_BYTES)) {
        pieces.push(windows);
        windows = [];
        current = undefined;
        tabs = 0;
        bytes = baseBytes;
      }
      if (!current) {
        current = {tabs: []};
        windows.push(current);
        bytes += byteLength({tabs: []}) + 1;
      }
      current.tabs.push(tab);
      tabs++;
      bytes += byteLength(tab) + 1;
    }
  }
  pieces.push(windows);
  if (pieces.length === 1) {
    return [session];
  }
  return pieces.map((piece, index) => ({...session, name: partName(session.name, index + 1, pieces.length), windows: piece}));
}

/**
 * Serializes sessions into one or more export files, each accepted by `parseImport`.
 * Sessions too large for a single file are split into numbered parts.
 */
export function buildExports(sessions: readonly Session[]): string[] {
  const files: Session[][] = [];
  let file: Session[] = [];
  let tabs = 0;
  let bytes = 0;
  for (const session of sessions.flatMap(splitSession)) {
    const sessionTabs = countTabs(session);
    const sessionBytes = byteLength(session) + 1;
    if (file.length > 0 && (file.length + 1 > MAX_IMPORT_SESSIONS ||
      tabs + sessionTabs > MAX_IMPORT_TABS || bytes + sessionBytes > PART_BYTES)) {
      files.push(file);
      file = [];
      tabs = 0;
      bytes = 0;
    }
    file.push(session);
    tabs += sessionTabs;
    bytes += sessionBytes;
  }
  files.push(file);
  return files.map(part => JSON.stringify({version: 1, sessions: part}));
}
