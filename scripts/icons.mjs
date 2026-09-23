import {Buffer} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launch} from 'puppeteer-core';

// Rasterizes the source SVG; Chromium toolbar icons must be PNG.
const root = resolve(import.meta.dirname, '..');
const executablePath = process.env.SM_BROWSER ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = await readFile(resolve(root, 'public/icons/icon.svg'), 'utf8');
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const browser = await launch({executablePath, headless: true, pipe: true});
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewport({width: size, height: size});
    await page.setContent(`<style>body{margin:0}</style><img src="${source}" width="${size}" height="${size}">`);
    await page.waitForFunction(() => globalThis.document.images[0]?.complete);
    await page.screenshot({path: resolve(root, `public/icons/icon-${size}.png`), omitBackground: true});
    console.log(`Wrote public/icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
