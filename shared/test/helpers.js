// Test helpers: read repository files relative to the repo root.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {string} relPath path relative to the repo root */
export function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));
}

/** @param {string} relPath */
export function exists(relPath) {
  return existsSync(resolve(repoRoot, relPath));
}

/** Deep copy, so tests can mutate fixtures freely. */
export function clone(value) {
  return structuredClone(value);
}

/** @param {{ path: string, code: string }[]} issues */
export function codes(issues) {
  return issues.map((i) => i.code);
}
