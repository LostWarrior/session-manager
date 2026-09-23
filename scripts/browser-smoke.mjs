import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {launch} from 'puppeteer-core';
import {checkStorageFailures} from './browser-storage-tests.mjs';

const defaultBrowser = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.SM_BROWSER && process.platform !== 'darwin') {
  throw new Error('Set SM_BROWSER to a Chromium browser executable on this platform.');
}
const executablePath = process.env.SM_BROWSER ?? defaultBrowser;
const profile = await mkdtemp(join(tmpdir(), 'session-manager-test-'));
const server = createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end(`<title>Research ${request.url}</title><h1>Local browser fixture</h1>`);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const extensionPath = resolve('dist/chromium');
const useFlags = process.env.SM_EXTENSION_LOAD === 'flags';
const launchOptions = {
  executablePath, headless: true, pipe: true, userDataDir: profile,
  enableExtensions: useFlags ? true : [extensionPath],
  args: useFlags ? [`--load-extension=${extensionPath}`, `--disable-extensions-except=${extensionPath}`] : [],
};
try {
  browser = await launch(launchOptions);
  const worker = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().includes('/background/index.js'));
  const extensionOrigin = new URL(worker.url()).origin;
  // URL.origin is "null" for extension schemes in Node.
  const base = extensionOrigin === 'null' ? worker.url().split('/').slice(0, 3).join('/') : extensionOrigin;
  const fixture = await browser.newPage();
  await fixture.goto(`${origin}/research`);
  let library = await browser.newPage();
  const errors = [];
  library.on('pageerror', error => errors.push(error.message));
  await library.goto(`${base}/ui/library.html`);
  await library.waitForFunction(() => globalThis.document.querySelector('#status')?.textContent === '');
  // A freshly loaded extension is unpinned, so the toolbar tip shows until dismissed.
  await library.waitForSelector('.pin-hint');
  await library.click('.pin-hint button');
  assert.equal(await library.$('.pin-hint'), null);
  await library.reload();
  await library.waitForFunction(() => globalThis.document.querySelector('#status')?.textContent === '');
  assert.equal(await library.$('.pin-hint'), null, 'Dismissed toolbar tip stays hidden.');
  const command = (type, id = '', value = '') => library.evaluate(async message => {
    return await chrome.runtime.sendMessage(message);
  }, {type, id, value});
  let reply = await command('save', 'all', 'Browser smoke session');
  assert.equal(reply.ok, true, reply.message);
  const saved = reply.data.find(session => session.name === 'Browser smoke session');
  assert.ok(saved);
  assert.equal(saved.windows.flatMap(window => window.tabs).length, 1);
  const cdp = await library.createCDPSession();
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await library.reload();
  await library.waitForSelector('.session');
  assert.match(await library.$eval('#items', node => node.textContent), /Browser smoke session/);
  reply = await command('restore', saved.id);
  assert.equal(reply.ok, true, reply.message);
  assert.match(reply.message, /1 tab opened/);
  assert.equal((await browser.pages()).filter(page => page.url() === `${origin}/research`).length, 2);
  reply = await command('trash', saved.id);
  assert.equal(reply.data.find(session => session.id === saved.id).deleted, true);
  reply = await command('recover', saved.id);
  assert.equal(reply.data.find(session => session.id === saved.id).deleted, false);
  reply = await command('import', '', '{bad json');
  assert.equal(reply.ok, false);
  reply = await command('list');
  assert.equal(reply.data.length, 1);
  const imported = await command('import', '', JSON.stringify({version: 1, sessions: [saved]}));
  assert.equal(imported.data.length, 2);
  assert.notEqual(imported.data[0].id, imported.data[1].id);
  reply = await command('delete-permanently', saved.id);
  assert.equal(reply.ok, false, 'Active sessions cannot be permanently deleted.');
  assert.ok((await command('list')).data.some(session => session.id === saved.id));
  await command('trash', saved.id);
  const importedId = imported.data.find(session => session.id !== saved.id).id;
  await command('trash', importedId);
  const abortedDeletion = await library.evaluate(async ({base, id}) => {
    const storage = await import(`${base}/storage/sessions.js`);
    const originalDelete = globalThis.IDBObjectStore.prototype.delete;
    let rejected = false;
    globalThis.IDBObjectStore.prototype.delete = function(key) {
      const request = originalDelete.call(this, key);
      this.transaction.abort();
      return request;
    };
    try {
      await storage.deleteTrashedSessions(id);
    } catch {
      rejected = true;
    } finally {
      globalThis.IDBObjectStore.prototype.delete = originalDelete;
    }
    return {rejected, preserved: (await storage.listSessions()).some(session => session.id === id && session.deleted)};
  }, {base, id: saved.id});
  assert.deepEqual(abortedDeletion, {rejected: true, preserved: true});
  await checkStorageFailures(library, base, saved);
  await library.click('[data-view="trash"]');
  await library.waitForFunction(() => globalThis.document.querySelectorAll('.session').length === 2);
  const deleteButton = await library.$('.session button');
  assert.ok(deleteButton);
  assert.equal(await deleteButton.evaluate(button => button.textContent), 'Recover');
  const permanentDeleteButton = await library.$('.session button:nth-of-type(2)');
  assert.ok(permanentDeleteButton);
  assert.equal(await permanentDeleteButton.evaluate(button => button.textContent), 'Delete permanently');
  let dialogHandled = false;
  const cancelDialog = async dialog => {
    dialogHandled = true;
    await dialog.dismiss();
  };
  library.once('dialog', cancelDialog);
  await permanentDeleteButton.click();
  await library.waitForFunction(() => globalThis.document.querySelector('#empty-trash')?.hidden === false);
  assert.equal(dialogHandled, true);
  assert.equal((await command('list')).data.filter(session => session.deleted).length, 2);
  dialogHandled = false;
  library.once('dialog', cancelDialog);
  await library.click('#empty-trash');
  await library.waitForFunction(() => globalThis.document.querySelector('#empty-trash')?.hidden === false);
  assert.equal(dialogHandled, true);
  assert.equal((await command('list')).data.filter(session => session.deleted).length, 2);
  const acceptDialog = async dialog => {
    dialogHandled = true;
    await dialog.accept();
  };
  dialogHandled = false;
  library.once('dialog', acceptDialog);
  await permanentDeleteButton.click();
  await library.waitForFunction(() => globalThis.document.querySelectorAll('.session').length === 1);
  assert.equal(dialogHandled, true);
  assert.equal((await command('list')).data.length, 1);
  assert.equal(await library.$eval('#heading', heading => heading === document.activeElement), true);
  dialogHandled = false;
  library.once('dialog', acceptDialog);
  await library.click('#empty-trash');
  await library.waitForFunction(() => globalThis.document.querySelectorAll('.session').length === 0);
  assert.equal(dialogHandled, true);
  assert.equal((await command('list')).data.length, 0);
  await command('import', '', JSON.stringify({version: 1, sessions: [saved]}));
  // Restart with the same test profile to verify durable storage, not just UI state.
  await browser.close();
  browser = await launch(launchOptions);
  library = await browser.newPage();
  library.on('pageerror', error => errors.push(error.message));
  await library.goto(`${base}/ui/library.html`);
  await library.waitForFunction(() => globalThis.document.querySelector('#status')?.textContent === '');
  reply = await command('list');
  assert.equal(reply.data.length, 1);
  const databaseName = 'session-manager';
  await library.evaluate(async ({databaseName}) => {
    const db = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('sessions', 'readwrite');
    const store = transaction.objectStore('sessions');
    for (let index = 0; index < 10001; index++) {
      store.put({
        id: `regression-large-${index}`, name: `Large fixture ${index}`, createdAt: index,
        favorite: false, deleted: false, windows: [{tabs: [{url: 'https://example.com/', title: 'Fixture', pinned: false}]}],
      });
    }
    store.put({id: 'regression-invalid', name: '', createdAt: 1, favorite: false, deleted: false, windows: []});
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, {databaseName});
  const restoreLogResult = await library.evaluate(async ({databaseName, base}) => {
    const db = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('operations', 'readwrite');
    const store = transaction.objectStore('operations');
    for (let index = 0; index < 105; index++) {
      store.put({id: `regression-old-${index}`, state: 'finished', opened: 1, failed: 0, updatedAt: 1_000_000_000_000_000 + index});
    }
    store.put({id: 'regression-legacy', state: 'finished', opened: 0, failed: 0});
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    const storage = await import(`${base}/storage/sessions.js`);
    await storage.recordRestore('regression-current', 'finished', 1, 0);
    const readDb = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = readDb.transaction('operations', 'readonly').objectStore('operations').getAll();
    const records = await new Promise((resolve, reject) => {
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    readDb.close();
    return {
      count: records.length,
      hasCurrent: records.some(record => record.id === 'regression-current'),
      hasLegacy: records.some(record => record.id === 'regression-legacy'),
    };
  }, {databaseName, base});
  assert.equal(restoreLogResult.count, 100);
  assert.equal(restoreLogResult.hasCurrent, true);
  assert.equal(restoreLogResult.hasLegacy, false);
  reply = await command('list');
  assert.equal(reply.ok, true, reply.message);
  assert.equal(reply.data.length, 10002);
  assert.ok(!reply.data.some(session => session.id === 'regression-invalid'));
  assert.match(reply.message, /1 unreadable session hidden/);
  reply = await command('empty-trash');
  assert.equal(reply.ok, true, reply.message);
  assert.equal(reply.data.length, 10002, 'Emptying Trash keeps valid active sessions.');
  assert.doesNotMatch(reply.message, /unreadable/);
  await library.evaluate(async ({databaseName}) => {
    const db = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('sessions', 'readwrite');
    const store = transaction.objectStore('sessions');
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const id of request.result) {
        if (typeof id === 'string' && id.startsWith('regression-')) store.delete(id);
      }
    };
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, {databaseName});
  // Files over the 5 MB message limit import through the page in batches.
  const bigTab = {url: `https://example.com/${'a'.repeat(16_000)}`, title: 't'.repeat(16_000), pinned: false};
  const largeImport = Array.from({length: 200}, (_, index) => ({
    id: `large-import-${index}`, name: `Large import ${index}`, createdAt: index, favorite: false, deleted: false,
    windows: [{tabs: [bigTab]}],
  }));
  const largeFile = join(profile, 'large-export.json');
  await writeFile(largeFile, JSON.stringify({version: 1, sessions: largeImport}, null, 2));
  const beforeLargeImport = (await command('list')).data.length;
  library.once('dialog', dialog => dialog.accept());
  const importInput = await library.$('#import');
  await importInput.uploadFile(largeFile);
  await library.waitForFunction(() => /^Imported 200 sessions/.test(globalThis.document.querySelector('#status')?.textContent ?? ''), {timeout: 60_000});
  assert.deepEqual(await library.evaluate(() => ({
    label: globalThis.document.querySelector('#import-label').textContent,
    busy: globalThis.document.querySelector('#import-button').classList.contains('busy'),
    disabled: globalThis.document.querySelector('#import').disabled,
  })), {label: 'Import', busy: false, disabled: false}, 'Import control resets after importing.');
  reply = await command('list');
  assert.equal(reply.data.length, beforeLargeImport + 200);
  for (const session of reply.data.filter(item => item.name.startsWith('Large import '))) {
    await command('trash', session.id);
  }
  await command('empty-trash');
  assert.equal((await command('list')).data.length, beforeLargeImport);
  await library.reload();
  await library.waitForSelector('.session');
  await library.setViewport({width: 1280, height: 900});
  await mkdir('artifacts', {recursive: true});
  await library.screenshot({path: 'artifacts/library.png', fullPage: true});
  assert.deepEqual(errors, []);
  console.log(`Browser smoke passed: ${await browser.version()}. Save, worker suspension, browser restart, restore, storage failures, Trash, permanent deletion confirmation, recovery, import, large-file batched import, oversized libraries, unreadable record notice and removal, restore-log pruning, toolbar tip, and UI rendering.`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true});
}
