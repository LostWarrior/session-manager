import {isRecord, isSession} from '../domain/session.js';
import type {Session} from '../domain/session.js';
import {MAX_RESTORE_OPERATIONS} from '../shared/limits.js';

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (database) {
    return database;
  }
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open('session-manager', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sessions', {keyPath: 'id'});
      request.result.createObjectStore('operations', {keyPath: 'id'});
    };
    request.onerror = () => {
      if (database === opening) {
        database = undefined;
      }
      settled = true;
      reject(new Error('Storage could not be opened. Existing data was not reset.'));
    };
    request.onblocked = () => {
      if (database === opening) {
        database = undefined;
      }
      settled = true;
      reject(new Error('Close other extension pages and retry the storage upgrade.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        if (database === opening) {
          database = undefined;
        }
      };
      resolve(db);
    };
  });
  database = opening;
  return opening;
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { resolve(); };
    transaction.onabort = () => { reject(new Error('Storage write failed. Existing sessions are preserved.')); };
    transaction.onerror = () => { /* onabort reports the final transaction outcome. */ };
  });
}

export interface Library {
  sessions: Session[];
  /** Stored records that fail validation; kept until the user empties Trash. */
  unreadable: number;
}

export async function listLibrary(): Promise<Library> {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const done = completed(transaction);
  const request = transaction.objectStore('sessions').getAll();
  await done;
  const result: unknown = request.result;
  if (!Array.isArray(result)) {
    return {sessions: [], unreadable: 0};
  }
  const sessions = result.filter(isSession).sort((a, b) => b.createdAt - a.createdAt);
  return {sessions, unreadable: result.length - sessions.length};
}

export async function listSessions(): Promise<Session[]> {
  return (await listLibrary()).sessions;
}

export async function putSessions(sessions: readonly Session[]): Promise<void> {
  if (!sessions.every(isSession)) {
    throw new Error('Session validation failed before saving.');
  }
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const done = completed(transaction);
  for (const session of sessions) {
    transaction.objectStore('sessions').put(session);
  }
  await done;
}

export async function recordRestore(id: string, state: string, opened: number, failed: number): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('operations', 'readwrite');
  const done = completed(transaction);
  const operations = transaction.objectStore('operations');
  const request = operations.openCursor();
  const previous: Array<{key: IDBValidKey; updatedAt: number}> = [];
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      const key = cursor.primaryKey;
      if (key !== id) {
        const record: unknown = cursor.value;
        const updatedAt = isRecord(record) && typeof record.updatedAt === 'number' &&
            Number.isFinite(record.updatedAt) ? record.updatedAt : 0;
        previous.push({key, updatedAt});
      }
      cursor.continue();
      return;
    }

    const updatedAt = Date.now();
    operations.put({id, state, opened, failed, updatedAt});
    previous.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const record of previous.slice(MAX_RESTORE_OPERATIONS - 1)) {
      operations.delete(record.key);
    }
  };
  await done;
}

export async function deleteTrashedSessions(id?: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const done = completed(transaction);
  const store = transaction.objectStore('sessions');
  let validationError: Error | undefined;

  if (id === undefined) {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const record: unknown = cursor.value;
      // Emptying Trash is also the only way to remove records that fail validation.
      if (!isSession(record) || record.deleted) {
        cursor.delete();
      }
      cursor.continue();
    };
  } else {
    const request = store.get(id);
    request.onsuccess = () => {
      const record: unknown = request.result;
      if (!isRecord(record)) {
        validationError = new Error('Session does not exist.');
      } else if (record.deleted !== true) {
        validationError = new Error('Only trashed sessions can be deleted permanently.');
      } else {
        store.delete(id);
      }
    };
  }

  await done;
  if (validationError) {
    throw validationError;
  }
}
