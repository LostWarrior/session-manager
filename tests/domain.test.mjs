import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureWindows, countTabs, isWebUrl, parseImport, parseSessions} from '../.build/domain/session.js';
import {isBookmarkCommand, isCommand, parseReply} from '../.build/shared/messages.js';
import {MAX_IMPORT_BYTES, MAX_IMPORT_SESSIONS} from '../.build/shared/limits.js';
import {quantity} from '../.build/shared/format.js';

const fixture = {
  id: 'fixture', name: 'Research', createdAt: 1, favorite: false, deleted: false,
  windows: [{tabs: [{url: 'https://example.com/?q=1#part', title: 'Example', pinned: true}]}],
};

test('capture excludes private and unsupported tabs, orders tabs, and preserves duplicates', () => {
  const base = {windowId: 1, index: 0, incognito: false, pinned: false, url: 'https://example.com/'};
  const result = captureWindows([
    {...base, index: 2, title: 'second'},
    {...base, index: 0, pinned: true, title: 'first'},
    {...base, incognito: true, title: 'private'},
    {...base, url: 'chrome://settings/'},
    {...base, windowId: 2, url: 'http://localhost/test'},
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].tabs.map(tab => tab.title), ['first', 'second']);
  assert.equal(result[0].tabs[0].pinned, true);
});

test('capture truncates oversized page titles so the session stays valid', () => {
  const [window] = captureWindows([{windowId: 1, index: 0, incognito: false, pinned: false, url: 'https://example.com/', title: 'x'.repeat(20_000)}]);
  assert.equal(window.tabs[0].title.length, 16_384);
  assert.equal(parseSessions([{...fixture, windows: [window]}]).length, 1);
});

test('URL policy blocks active, local, and malformed schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'about:blank', 'not a url', null]) {
    assert.equal(isWebUrl(url), false);
  }
  assert.equal(isWebUrl('https://example.com/?token=123#fragment'), true);
});

test('exports round-trip full URL and pinning without altering the source', () => {
  const original = structuredClone(fixture);
  const result = parseImport(JSON.stringify({version: 1, sessions: [fixture]}));
  assert.deepEqual(result, [fixture]);
  assert.equal(countTabs(result[0]), 1);
  assert.deepEqual(original, fixture);
});

test('invalid import versions and unsafe nested URLs are rejected', () => {
  assert.throws(() => parseImport('{'));
  assert.throws(() => parseImport(JSON.stringify({version: 2, sessions: []})), /Unsupported/);
  const unsafe = structuredClone(fixture);
  unsafe.windows[0].tabs[0].url = 'javascript:alert(1)';
  assert.throws(() => parseImport(JSON.stringify({version: 1, sessions: [unsafe]})), /Invalid/);
  assert.throws(() => parseSessions([{...fixture, name: ''}]), /Invalid/);
  assert.throws(() => parseSessions([{...fixture, createdAt: Infinity}]), /Invalid/);
});

test('imports enforce byte and tab limits', () => {
  assert.throws(() => parseImport(' '.repeat(5_000_001)), /5 MB/);
  const many = {...fixture, windows: Array.from({length: 11}, () => ({tabs: Array.from({length: 1000}, () => fixture.windows[0].tabs[0])}))};
  assert.throws(() => parseImport(JSON.stringify({version: 1, sessions: [many]})), /10,000/);
});

test('message boundaries reject unknown commands and malformed replies', () => {
  assert.equal(isCommand({type: 'save', id: 'all', value: 'Work'}), true);
  assert.equal(isCommand({type: 'eval', id: '', value: ''}), false);
  assert.equal(isCommand({type: 'save', id: 2, value: 'Work'}), false);
  assert.throws(() => parseReply({ok: 'true'}), /invalid response/);
});

test('library validation has no import count cap while imports remain bounded', () => {
  const sessions = Array.from({length: MAX_IMPORT_SESSIONS + 1}, (_, index) => ({...fixture, id: String(index)}));
  assert.equal(parseSessions(sessions).length, MAX_IMPORT_SESSIONS + 1);
  assert.throws(() => parseImport(JSON.stringify({version: 1, sessions})), /10,000 sessions/);
});

test('command size uses UTF-8 bytes and accepts the exact limit', () => {
  assert.equal(isCommand({type: 'import', id: '', value: 'a'.repeat(MAX_IMPORT_BYTES)}), true);
  const oversized = 'é'.repeat(MAX_IMPORT_BYTES / 2 + 1);
  assert.equal(isCommand({type: 'import', id: '', value: oversized}), false);
  assert.throws(() => parseImport(oversized), /5 MB/);
});

test('shared command classification and quantity formatting', () => {
  for (const type of ['bookmarks', 'bookmark-create', 'bookmark-edit', 'bookmark-delete']) {
    assert.equal(isBookmarkCommand(type), true);
  }
  for (const type of ['save', 'restore', 'delete-permanently', 'empty-trash']) {
    assert.equal(isBookmarkCommand(type), false);
    assert.equal(isCommand({type, id: '', value: ''}), true);
  }
  assert.equal(quantity(0, 'tab'), '0 tabs');
  assert.equal(quantity(1, 'tab'), '1 tab');
  assert.equal(quantity(2, 'tab'), '2 tabs');
});
