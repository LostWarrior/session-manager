import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {test} from 'node:test';
import {ESLint} from 'eslint';

test('ESLint enforces guide rules instead of merely loading', async () => {
  const linter = new ESLint();
  const [result] = await linter.lintText(
    'export default function unsafe(value: any): String { return value; }\n',
    {filePath: 'src/domain/session.ts'},
  );
  const rules = new Set(result.messages.map(message => message.ruleId));
  assert.ok(rules.has('no-restricted-syntax'));
  assert.ok(rules.has('@typescript-eslint/no-explicit-any'));
  assert.ok(rules.has('@typescript-eslint/no-wrapper-object-types'));
  assert.ok(rules.has('@typescript-eslint/no-unsafe-return'));
});

test('packages contain correct backgrounds and only justified permissions', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  for (const target of ['chromium', 'firefox']) {
    const root = `dist/${target}`;
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version, 'Built manifests take their version from package.json.');
    assert.deepEqual(manifest.permissions, ['tabs']);
    assert.deepEqual(manifest.optional_permissions, ['bookmarks']);
    assert.equal(manifest.incognito, 'not_allowed');
    assert.equal(manifest.background.type, 'module');
    assert.equal(manifest.host_permissions, undefined);
    const background = target === 'firefox' ? manifest.background.scripts[0] : manifest.background.service_worker;
    await access(`${root}/${background}`);
    await access(`${root}/${manifest.action.default_popup}`);
    for (const icons of [manifest.icons, manifest.action.default_icon]) {
      assert.deepEqual(Object.keys(icons), ['16', '32', '48', '128']);
      await Promise.all(Object.values(icons).map(icon => access(`${root}/${icon}`)));
    }
    await access(`${root}/ui/library.js`);
    await access(`${root}/ui/styles.css`);
  }
});
