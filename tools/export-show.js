#!/usr/bin/env node
// Single-file HTML export (I-054): node tools/export-show.js <show folder> [output.html]
// Packs the show, its template and the viewer into one HTML file that presents offline.
// Run from anywhere; paths are taken relative to the current directory.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packShow } from '../shared/export/single-file.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [showArg, outArg] = process.argv.slice(2);
if (!showArg) {
  console.error('Usage: npm run export -- <show folder> [output.html]\n  e.g. npm run export -- shows/demo');
  process.exit(1);
}

const showDir = relative(root, resolve(showArg)).split(sep).join('/');
if (showDir.startsWith('..')) {
  console.error(`The show folder must be inside the Slipr folder (${root}).`);
  process.exit(1);
}

/** Files are read relative to the Slipr folder; missing files give null. */
const read = async (/** @type {string} */ path) => {
  try {
    return new Uint8Array(await readFile(resolve(root, path)));
  } catch {
    return null;
  }
};

const result = await packShow({ readFile: read, showDir });
const id = showDir.split('/').pop();
const out = resolve(outArg ?? resolve(root, 'exports', `${id}.html`));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, result.html, 'utf8');

const kb = (Buffer.byteLength(result.html) / 1024).toFixed(0);
console.log(`Exported "${result.title}" to ${relative(process.cwd(), out)} (${kb} KB: ${result.modules.length} modules, ${result.files.length} files).`);
for (const w of result.warnings) console.warn(`  warning: ${w}`);
