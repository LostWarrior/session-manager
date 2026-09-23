import assert from 'node:assert/strict';
import {test} from 'node:test';

test('bookmark mutations reject folders, root nodes, and missing IDs', async () => {
  const originalChrome = globalThis.chrome;
  const tree = [{id: 'root', title: '', children: [
    {id: 'toolbar', parentId: 'root', title: 'Toolbar', children: [
      {id: 'folder', parentId: 'toolbar', title: 'Folder', children: []},
      {id: 'bookmark', parentId: 'toolbar', title: 'Bookmark', url: 'https://example.com'},
    ]},
  ]}];
  globalThis.chrome = {
    runtime: {lastError: undefined},
    permissions: {contains: (_permissions, callback) => callback(true)},
    bookmarks: {
      getTree: callback => callback(tree),
      create: () => assert.fail('Invalid folder must not be passed to the browser'),
      update: () => assert.fail('Invalid bookmark must not be passed to the browser'),
      remove: () => assert.fail('Invalid bookmark must not be passed to the browser'),
    },
  };

  try {
    const {execute} = await import('../.build/services/commands.js');
    const value = JSON.stringify({title: 'New', url: 'https://example.com'});
    for (const id of ['root', 'bookmark', 'missing']) {
      await assert.rejects(execute({type: 'bookmark-create', id, value}), /Choose an existing bookmark folder/);
    }
    for (const type of ['bookmark-edit', 'bookmark-delete']) {
      for (const id of ['root', 'toolbar', 'folder', 'missing']) {
        await assert.rejects(execute({type, id, value}), /This bookmark no longer exists/);
      }
    }
  } finally {
    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
  }
});

test('bookmark mutations accept existing folders and bookmarks', async () => {
  const originalChrome = globalThis.chrome;
  const tree = [{id: 'root', title: '', children: [
    {id: 'toolbar', parentId: 'root', title: 'Toolbar', children: [
      {id: 'bookmark', parentId: 'toolbar', title: 'Bookmark', url: 'https://example.com'},
    ]},
  ]}];
  const calls = [];
  globalThis.chrome = {
    runtime: {lastError: undefined},
    permissions: {contains: (_permissions, callback) => callback(true)},
    bookmarks: {
      getTree: callback => callback(tree),
      create: (details, callback) => { calls.push(['create', details]); callback({}); },
      update: (id, details, callback) => { calls.push(['update', id, details]); callback({}); },
      remove: (id, callback) => { calls.push(['remove', id]); callback(); },
    },
  };

  try {
    const {execute} = await import('../.build/services/commands.js');
    const details = {title: 'New', url: 'https://example.com/new'};
    const value = JSON.stringify(details);
    for (const [type, id] of [['bookmark-create', 'toolbar'], ['bookmark-edit', 'bookmark'], ['bookmark-delete', 'bookmark']]) {
      const reply = await execute({type, id, value});
      assert.equal(reply.ok, true);
      assert.deepEqual(reply.data, tree);
    }
    assert.deepEqual(calls, [
      ['create', {parentId: 'toolbar', ...details}],
      ['update', 'bookmark', details],
      ['remove', 'bookmark'],
    ]);
  } finally {
    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
  }
});

test('restore records progress when the browser returns a window without an ID', async () => {
  const originalChrome = globalThis.chrome;
  const originalIndexedDB = globalThis.indexedDB;
  const session = {
    id: 'saved', name: 'Saved', createdAt: 1, favorite: false, deleted: false,
    windows: [{tabs: [{url: 'https://example.com', title: 'Example', pinned: false}]}],
  };
  const records = [];
  const database = {
    close() {},
    transaction(storeName) {
      const transaction = {
        objectStore: () => ({
          getAll: () => ({result: [session]}),
          openCursor: () => {
            const request = {result: null};
            globalThis.queueMicrotask(() => request.onsuccess());
            return request;
          },
          put: record => {
            assert.equal(storeName, 'operations');
            records.push(record);
          },
        }),
      };
      globalThis.setTimeout(() => transaction.oncomplete(), 0);
      return transaction;
    },
  };
  globalThis.indexedDB = {
    open: () => {
      const request = {result: database};
      globalThis.queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  globalThis.chrome = {
    runtime: {lastError: undefined},
    windows: {create: (_options, callback) => callback({})},
    tabs: {create: () => assert.fail('No tab may open without a window ID')},
  };

  try {
    const {execute} = await import('../.build/services/commands.js');
    const reply = await execute({type: 'restore', id: session.id, value: ''});
    assert.equal(reply.message, '0 tabs opened; 1 tab could not be opened. Existing tabs were kept.');
    assert.deepEqual(records.map(({state, opened, failed}) => ({state, opened, failed})), [
      {state: 'started', opened: 0, failed: 0},
      {state: 'running', opened: 0, failed: 1},
      {state: 'finished', opened: 0, failed: 1},
    ]);
    assert.equal(new Set(records.map(record => record.id)).size, 1);
  } finally {
    database.onversionchange?.();
    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
    if (originalIndexedDB === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDB;
    }
  }
});

test('message listener returns actionable errors from the command handler', async () => {
  const originalChrome = globalThis.chrome;
  let messageListener;
  globalThis.chrome = {
    runtime: {
      id: 'extension-id',
      getURL: path => `chrome-extension://extension-id/${path}`,
      onMessage: {addListener: listener => { messageListener = listener; }},
    },
  };

  try {
    const {listen} = await import('../.build/platform/browser.js');
    listen(async () => { throw new Error('Close other extension pages and retry.'); });
    const replyPromise = new Promise(resolve => {
      const keepOpen = messageListener(
        {type: 'list', id: '', value: ''},
        {id: 'extension-id', url: 'chrome-extension://extension-id/ui/library.html', tab: {incognito: false}},
        resolve,
      );
      assert.equal(keepOpen, true);
    });
    assert.deepEqual(await replyPromise, {
      ok: false, data: null, message: 'Close other extension pages and retry.',
    });
  } finally {
    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
  }
});
