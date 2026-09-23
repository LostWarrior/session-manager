import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {test} from 'node:test';
import {buildExports} from '../.build/domain/export.js';
import {countTabs, parseExport, parseImport} from '../.build/domain/session.js';
import {MAX_IMPORT_BYTES, MAX_IMPORT_TABS, MAX_NAME_LENGTH} from '../.build/shared/limits.js';

const tab = {url: 'https://example.com/', title: 'Example', pinned: false};
const session = (id, windows = [{tabs: [tab]}]) => ({id, name: `Session ${id}`, createdAt: 1, favorite: false, deleted: false, windows});
const importAll = files => files.flatMap(text => {
  assert.ok(Buffer.byteLength(text) <= MAX_IMPORT_BYTES);
  return parseImport(text);
});

test('small libraries export as a single importable file', () => {
  const files = buildExports([session('a'), session('b')]);
  assert.equal(files.length, 1);
  assert.deepEqual(importAll(files).map(item => item.id), ['a', 'b']);
});

test('libraries beyond session and tab limits split into importable files', () => {
  const sessions = Array.from({length: 10_001}, (_, index) => session(String(index)));
  const files = buildExports(sessions);
  assert.equal(files.length, 2);
  assert.deepEqual(importAll(files).map(item => item.id), sessions.map(item => item.id));
});

test('libraries beyond the byte limit split into importable files', () => {
  const big = {...tab, url: `https://example.com/${'a'.repeat(16_000)}`, title: 't'.repeat(16_000)};
  const sessions = Array.from({length: 200}, (_, index) => session(String(index), [{tabs: [big]}]));
  const files = buildExports(sessions);
  assert.ok(files.length > 1);
  assert.equal(importAll(files).length, 200);
});

test('a single oversized session splits into numbered parts preserving every tab', () => {
  const windows = Array.from({length: 12}, (_, w) => ({tabs: Array.from({length: 1000}, (_, t) => ({...tab, url: `https://example.com/${w}/${t}`}))}));
  const original = {...session('huge', windows), name: 'n'.repeat(MAX_NAME_LENGTH)};
  const imported = importAll(buildExports([original]));
  assert.ok(imported.length > 1);
  assert.ok(imported.every(item => countTabs(item) <= MAX_IMPORT_TABS && item.name.length <= MAX_NAME_LENGTH));
  assert.match(imported[0].name, /\(part 1 of \d+\)$/);
  const emoji = importAll(buildExports([{...original, name: `a${'😀'.repeat(MAX_NAME_LENGTH / 2 - 1)}`}]));
  assert.ok(emoji.every(item => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(item.name)), 'No emoji is cut in half.');
  assert.deepEqual(imported.flatMap(item => item.windows.flatMap(window => window.tabs)), windows.flatMap(window => window.tabs));
});

test('export files over the batch limit parse whole and re-split into importable batches', () => {
  const big = {...tab, url: `https://example.com/${'a'.repeat(16_000)}`, title: 't'.repeat(16_000)};
  const sessions = Array.from({length: 200}, (_, index) => session(String(index), [{tabs: [big]}]));
  const text = JSON.stringify({version: 1, sessions}, null, 2);
  assert.ok(Buffer.byteLength(text) > MAX_IMPORT_BYTES);
  assert.throws(() => parseImport(text), /5 MB/);
  const parsed = parseExport(text);
  assert.deepEqual(importAll(buildExports(parsed)).map(item => item.id), sessions.map(item => item.id));
  assert.throws(() => parseExport(JSON.stringify({version: 2, sessions: []})), /Unsupported/);
});
