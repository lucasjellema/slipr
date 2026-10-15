#!/usr/bin/env node
// Write the AI prompt kit (I-080) for Slipr's templates into docs/ai/prompts/.
//
//   npm run prompt                                   all templates in templates/index.json
//   npm run prompt -- --template templates/default   one template
//   npm run prompt -- --check                        exit 1 when a committed file is out of date
//
// Spec: docs/specs/I-080-prompt-kit.md
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from '../shared/prompt-kit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROMPTS_DIR = join(root, 'docs', 'ai', 'prompts');
const VARIANTS = /** @type {const} */ (['full', 'compact']);

/**
 * The prompt files for the given template folders (default: every template in
 * templates/index.json), as path → content.
 * @param {string[]} [templateDirs] Absolute or repo-relative template folders.
 * @returns {Map<string, string>}
 */
export function promptFiles(templateDirs) {
  const dirs = templateDirs ?? JSON.parse(readFileSync(join(root, 'templates', 'index.json'), 'utf8'))
    .templates.map((/** @type {string} */ id) => join('templates', id));
  const files = new Map();
  for (const dir of dirs) {
    const template = JSON.parse(readFileSync(resolve(root, dir, 'template.json'), 'utf8'));
    for (const variant of VARIANTS) {
      files.set(join(PROMPTS_DIR, `${template.id}-${variant}.md`), buildPrompt(template, { variant }));
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const at = args.indexOf('--template');
  const dirs = at >= 0 && args[at + 1] ? [args[at + 1]] : undefined;
  const files = promptFiles(dirs);
  let stale = 0;
  for (const [path, content] of files) {
    const shown = relative(root, path).replaceAll('\\', '/');
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (check) {
      if (current !== content) {
        stale += 1;
        console.error(`out of date: ${shown}`);
      }
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`${current === content ? 'unchanged' : 'wrote'} ${shown} (${content.length} characters)`);
  }
  if (check && stale > 0) {
    console.error('Run `npm run prompt` to regenerate.');
    process.exit(1);
  }
  if (check) console.log(`${files.size} prompt files up to date.`);
}

if (process.argv[1] && basename(process.argv[1]) === 'prompt-kit.js' && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
