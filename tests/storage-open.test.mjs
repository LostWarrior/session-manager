import assert from 'node:assert/strict';
import {test} from 'node:test';

test('a blocked database open can be retried and closes a late success', async () => {
  const requests = [];
  const originalIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {};
      requests.push(request);
      return request;
    },
  };

  try {
    const storage = await import(`../.build/storage/sessions.js?test=${Date.now()}`);
    const firstAttempt = storage.listSessions();
    requests[0].onblocked();
    await assert.rejects(firstAttempt, /Close other extension pages/);

    const retry = storage.listSessions();
    assert.equal(requests.length, 2);
    requests[0].onerror();
    const concurrentRead = storage.listSessions();
    assert.equal(requests.length, 2, 'A stale error must not invalidate the newer open.');

    let closed = false;
    requests[0].result = {
      close() { closed = true; },
    };
    requests[0].onsuccess();
    assert.equal(closed, true);

    const db = {
      close() {},
      transaction() {
        const transaction = {objectStore: () => ({getAll: () => ({result: []})})};
        globalThis.queueMicrotask(() => transaction.oncomplete());
        return transaction;
      },
    };
    requests[1].result = db;
    requests[1].onsuccess();
    assert.deepEqual(await retry, []);
    assert.deepEqual(await concurrentRead, []);
    db.onversionchange();
    const afterVersionChange = storage.listSessions();
    assert.equal(requests.length, 3);
    requests[2].onerror();
    await assert.rejects(afterVersionChange, /Storage could not be opened/);

    const afterOpenError = storage.listSessions();
    assert.equal(requests.length, 4, 'An open error must allow another attempt.');
    db.onversionchange();
    const concurrentRetry = storage.listSessions();
    assert.equal(requests.length, 4, 'A stale connection must not invalidate the newer open.');
    requests[3].result = db;
    requests[3].onsuccess();
    assert.deepEqual(await afterOpenError, []);
    assert.deepEqual(await concurrentRetry, []);
  } finally {
    if (originalIndexedDB === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDB;
    }
  }
});

test('stored libraries over the import limit remain readable and invalid records are preserved', async () => {
  const records = Array.from({length: 10_001}, (_, index) => ({
    id: `session-${index}`,
    name: `Session ${index}`,
    createdAt: index,
    favorite: false,
    deleted: false,
    windows: [{tabs: [{url: 'https://example.com/', title: 'Example', pinned: false}]}],
  }));
  const invalidRecord = {id: 'invalid', name: 'Damaged session', windows: []};
  records.splice(5000, 0, invalidRecord);
  const originalIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {
        result: {
          close() {},
          transaction(name, mode) {
            assert.equal(name, 'sessions');
            assert.equal(mode, 'readonly', 'Reading must not remove invalid stored data.');
            const transaction = {
              objectStore: () => ({getAll: () => ({result: records})}),
            };
            globalThis.queueMicrotask(() => transaction.oncomplete());
            return transaction;
          },
        },
      };
      globalThis.queueMicrotask(() => request.onsuccess());
      return request;
    },
  };

  try {
    const storage = await import('../.build/storage/sessions.js?test=large-library');
    const sessions = await storage.listSessions();
    assert.equal(sessions.length, 10_001);
    assert.equal(sessions[0].id, 'session-10000');
    assert.equal(sessions.at(-1).id, 'session-0');
    assert.equal(sessions.some(session => session.id === 'invalid'), false);
    assert.equal(records[5000], invalidRecord);
    assert.equal((await storage.listLibrary()).unreadable, 1);
    assert.equal(records[0].id, 'session-0');
  } finally {
    if (originalIndexedDB === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDB;
    }
  }
});
