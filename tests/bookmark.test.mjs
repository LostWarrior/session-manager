import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseBookmarkTree} from '../.build/domain/bookmark.js';

test('bookmark parsing preserves folder paths and excludes immutable root destinations', () => {
  const tree = [{id: 'root', title: '', children: [
    {id: 'toolbar', parentId: 'root', title: 'Toolbar', children: [
      {id: 'research', parentId: 'toolbar', title: 'Research', children: [
        {id: 'link', title: 'Source', url: 'https://example.com'},
      ]},
    ]},
    {id: 'managed', parentId: 'root', title: 'Managed', unmodifiable: 'managed', children: []},
    {id: 'separator', parentId: 'toolbar', title: '', type: 'separator'},
  ]}];
  const result = parseBookmarkTree(tree);
  assert.deepEqual(result.bookmarks, [{id: 'link', title: 'Source', url: 'https://example.com', folder: 'Toolbar / Research'}]);
  assert.deepEqual(result.folders.map(folder => folder.id), ['toolbar', 'research']);
});

test('malformed bookmark trees fail without an unchecked cast', () => {
  assert.throws(() => parseBookmarkTree(null), /Invalid/);
  assert.throws(() => parseBookmarkTree([{id: 1, title: 'Invalid'}]), /Invalid/);
});
