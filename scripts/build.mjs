import {execFileSync} from 'node:child_process';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
// Only generated paths inside this repository are cleaned.
await rm(resolve(root, '.build'), {recursive: true, force: true});
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc')], {
  cwd: root,
  stdio: 'inherit',
});
for (const target of ['chromium', 'firefox']) {
  const output = resolve(root, 'dist', target);
  await rm(output, {recursive: true, force: true});
  await mkdir(output, {recursive: true});
  await cp(resolve(root, '.build'), output, {recursive: true});
  await cp(resolve(root, 'public'), output, {recursive: true});
  // package.json is the single source of the version; manifests must not declare one.
  const {version, ...manifest} = JSON.parse(await readFile(resolve(root, 'manifests', `${target}.json`), 'utf8'));
  if (version !== undefined) {
    throw new Error(`Remove "version" from manifests/${target}.json; it comes from package.json.`);
  }
  const {manifest_version: manifestVersion, name, ...rest} = manifest;
  const builtManifest = {manifest_version: manifestVersion, name, version: pkg.version, ...rest};
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(builtManifest, null, 2)}\n`);
  console.log(`Built dist/${target}`);
}
