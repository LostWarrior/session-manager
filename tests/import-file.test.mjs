import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseImportFile} from '../.build/domain/import-file.js';

const tab = (id, windowId, index, extra = {}) => ({
  id, index, windowId, pinned: false, incognito: false, url: `https://example.com/${id}`, title: `Tab ${id}`,
  favIconUrl: 'https://example.com/icon.png', cookieStoreId: 'firefox-default', ...extra,
});

test('Tab Session Manager exports convert windows, tab order, titles, and pinning', () => {
  const file = [{
    id: 'abc', name: 'Research', date: 1_700_000_000_000, tag: [], windowsNumber: 2, tabsNumber: 4,
    windows: {
      3: {5: tab(5, 3, 1), 4: tab(4, 3, 0, {pinned: true})},
      9: {7: tab(7, 9, 0)},
    },
    windowsInfo: {3: {id: 3}, 9: {id: 9}},
  }];
  const {sessions, skipped} = parseImportFile(JSON.stringify(file));
  assert.equal(skipped, 0);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].name, 'Research');
  assert.equal(sessions[0].createdAt, 1_700_000_000_000);
  assert.deepEqual(sessions[0].windows, [
    {tabs: [{url: 'https://example.com/4', title: 'Tab 4', pinned: true}, {url: 'https://example.com/5', title: 'Tab 5', pinned: false}]},
    {tabs: [{url: 'https://example.com/7', title: 'Tab 7', pinned: false}]},
  ]);
});

test('Tab Session Manager imports drop private, unsafe, and malformed tabs and report empty sessions', () => {
  const file = [
    {name: '', windows: {1: {
      1: tab(1, 1, 0),
      2: tab(2, 1, 1, {incognito: true}),
      3: tab(3, 1, 2, {incognito: undefined}),
      4: tab(4, 1, 3, {url: 'about:newtab'}),
      5: tab(5, 1, 4, {url: 'javascript:alert(1)'}),
      6: {url: 'https://example.com/no-index'},
      7: tab(7, 1, 5, {title: 'x'.repeat(20_000)}),
    }}},
    {name: 'Only private', windows: {2: {1: tab(1, 2, 0, {incognito: true})}}},
    'not a session',
  ];
  const {sessions, skipped} = parseImportFile(JSON.stringify(file));
  assert.equal(skipped, 2);
  assert.equal(sessions[0].name, 'Imported session 1');
  assert.deepEqual(sessions[0].windows[0].tabs.map(item => item.url), ['https://example.com/1', 'https://example.com/7']);
  assert.equal(sessions[0].windows[0].tabs[1].title.length, 16_384);
});

test('native exports still parse and unknown objects are rejected', () => {
  const session = {id: 'a', name: 'A', createdAt: 1, favorite: false, deleted: false, windows: [{tabs: [{url: 'https://example.com/', title: 'E', pinned: false}]}]};
  assert.deepEqual(parseImportFile(JSON.stringify({version: 1, sessions: [session]})), {sessions: [session], skipped: 0});
  assert.throws(() => parseImportFile(JSON.stringify({sessions: []})), /Unsupported/);
});
