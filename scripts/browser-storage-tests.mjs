import assert from 'node:assert/strict';

export async function checkStorageFailures(page, base, fixture) {
  const result = await page.evaluate(async ({base, fixture}) => {
    const storage = await import(`${base}/storage/sessions.js`);
    const {execute} = await import(`${base}/services/commands.js`);
    const session = {...fixture, id: 'failure-fixture', deleted: false};
    await storage.putSessions([session]);
    const originalCreate = globalThis.chrome.windows.create;
    const originalPut = globalThis.IDBObjectStore.prototype.put;
    const states = [];
    let restoreReply;
    try {
      globalThis.chrome.windows.create = (_options, callback) => callback(undefined);
      globalThis.IDBObjectStore.prototype.put = function(value, ...args) {
        if (this.name === 'operations') states.push(structuredClone(value));
        return originalPut.call(this, value, ...args);
      };
      restoreReply = await execute({type: 'restore', id: session.id, value: ''});
    } finally {
      globalThis.chrome.windows.create = originalCreate;
      globalThis.IDBObjectStore.prototype.put = originalPut;
    }

    const second = {...session, id: 'failure-fixture-second', deleted: true};
    await storage.putSessions([{...session, deleted: true}, second]);
    const originalDelete = globalThis.IDBCursor.prototype.delete;
    let aborted = false;
    let rejected = false;
    try {
      globalThis.IDBCursor.prototype.delete = function() {
        const request = originalDelete.call(this);
        if (!aborted) {
          aborted = true;
          request.addEventListener('success', () => request.transaction.abort());
        }
        return request;
      };
      await storage.deleteTrashedSessions();
    } catch {
      rejected = true;
    } finally {
      globalThis.IDBCursor.prototype.delete = originalDelete;
    }
    const remaining = (await storage.listSessions()).map(item => item.id);
    await storage.deleteTrashedSessions(session.id);
    await storage.deleteTrashedSessions(second.id);
    return {states, restoreReply, aborted, rejected, remaining};
  }, {base, fixture});

  assert.deepEqual(result.states.map(record => record.state), ['started', 'running', 'finished']);
  assert.equal(result.states[1].opened, 0);
  assert.equal(result.states[1].failed, 1);
  assert.match(result.restoreReply.message, /0 tabs opened; 1 tab could not be opened/);
  assert.equal(result.aborted, true);
  assert.equal(result.rejected, true);
  assert.ok(result.remaining.includes('failure-fixture'));
  assert.ok(result.remaining.includes('failure-fixture-second'));
}
