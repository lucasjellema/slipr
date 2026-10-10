// Test helpers: read repository files relative to the repo root.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
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

/**
 * A minimal FileSystemDirectoryHandle over a real directory, for code that
 * reads show folders (shared/folder-source.js). Missing entries reject with a
 * NotFoundError, like the browser.
 * @param {string} absPath
 */
export function fakeDirectory(absPath) {
  const notFound = (name) => new DOMException(`${name} not found`, 'NotFoundError');
  const isKind = (p, dir) => existsSync(p) && statSync(p).isDirectory() === dir;
  return {
    kind: 'directory',
    name: basename(absPath),
    async getDirectoryHandle(name) {
      const p = resolve(absPath, name);
      if (!isKind(p, true)) throw notFound(name);
      return fakeDirectory(p);
    },
    async getFileHandle(name) {
      const p = resolve(absPath, name);
      if (!isKind(p, false)) throw notFound(name);
      return { kind: 'file', name, getFile: async () => new File([readFileSync(p)], name) };
    },
  };
}
