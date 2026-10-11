import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repoRoot } from './helpers.js';
import {
  VIRTUAL_ROOT, inlineCssUrls, inlineHtmlUrls, normalizePath, packShow, resolvePath, rewriteModule, templateFolder,
} from '../export/single-file.js';

/** Read repository files (null when missing), as the export command does. */
const readRepo = async (path) => {
  try {
    return new Uint8Array(await readFile(resolve(repoRoot, path)));
  } catch {
    return null;
  }
};

const text = (s) => new TextEncoder().encode(s);

describe('single-file export: paths (I-054)', () => {
  test('normalizePath and resolvePath', () => {
    assert.equal(normalizePath('a/./b/../c'), 'a/c');
    assert.equal(normalizePath('../x'), null);
    assert.equal(resolvePath('viewer/js/main.js', '../../shared/load.js'), 'shared/load.js');
    assert.equal(resolvePath('templates/t/theme.css', 'assets/f.woff2?v=2#x'), 'templates/t/assets/f.woff2');
  });

  test('templateFolder: relative, root-relative, outside the Slipr folder, URL', () => {
    assert.equal(templateFolder('shows/demo', '../../templates/default'), 'templates/default');
    assert.equal(templateFolder('shows/demo', '/templates/conclusion'), 'templates/conclusion');
    assert.equal(templateFolder('shows/demo', '../../../../elsewhere/templates/brand/'), 'templates/brand');
    assert.equal(templateFolder('shows/demo', 'https://example.com/t'), null);
  });
});

describe('single-file export: module rewriting (I-054)', () => {
  test('relative imports become virtual URLs; others stay', () => {
    const src = [
      "import { a } from './a.js';",
      "import '../side.js';",
      "export { b } from \"./b.js\";",
      "const m = await import('./lazy.js');",
      "import Reveal from 'https://cdn.example/x.js';",
      "import data from './s.json' with { type: 'json' };",
    ].join('\n');
    const { code, imports } = rewriteModule(src, 'viewer/js/main.js');
    assert.ok(code.includes(`from '${VIRTUAL_ROOT}viewer/js/a.js'`));
    assert.ok(code.includes(`import '${VIRTUAL_ROOT}viewer/side.js'`));
    assert.ok(code.includes(`from "${VIRTUAL_ROOT}viewer/js/b.js"`));
    assert.ok(code.includes(`import('${VIRTUAL_ROOT}viewer/js/lazy.js')`));
    assert.ok(code.includes("from 'https://cdn.example/x.js'"), 'absolute URLs untouched');
    assert.deepEqual(imports.sort(), ['viewer/js/a.js', 'viewer/js/b.js', 'viewer/js/lazy.js', 'viewer/js/s.json', 'viewer/side.js']);
  });

  test('minified imports are rewritten; look-alike strings are not', () => {
    const src = 'import{x}from"./chunks/c-1.mjs";const s=this.f("from",e,n);import("./chunks/c-2.mjs");';
    const { code, imports } = rewriteModule(src, 'vendor/m/dist/m.mjs');
    assert.deepEqual(imports, ['vendor/m/dist/chunks/c-1.mjs', 'vendor/m/dist/chunks/c-2.mjs']);
    assert.ok(code.includes('this.f("from",e,n)'));
  });

  test('import.meta.url becomes the module\'s virtual URL; files it loads are reported', () => {
    const src = "const css = new URL('../../vendor/r/reset.css', import.meta.url); const dir = new URL('./x/', import.meta.url);";
    const { code, metaUrls } = rewriteModule(src, 'viewer/audience/audience.js');
    assert.ok(!code.includes('import.meta'));
    assert.ok(code.includes(`"${VIRTUAL_ROOT}viewer/audience/audience.js"`));
    assert.deepEqual(metaUrls, ['vendor/r/reset.css'], 'folders are skipped');
  });
});

describe('single-file export: inlining (I-054)', () => {
  const files = { 't/assets/f.woff2': new Uint8Array([1, 2, 3]), 't/logo.svg': text('<svg/>') };
  const read = async (p) => files[p] ?? null;

  test('CSS url()s become data: URIs; absolute ones stay; missing ones are reported', async () => {
    const warnings = [];
    const css = 'a{src:url("assets/f.woff2") format("woff2")} b{background:url(data:image/png;base64,AA)} c{background:url(nope.png)}';
    const out = await inlineCssUrls(css, 't/theme.css', read, warnings);
    assert.ok(out.includes('url("data:font/woff2;base64,AQID")'));
    assert.ok(out.includes('url(data:image/png;base64,AA)'));
    assert.equal(warnings.length, 1);
  });

  test('layout src/href become data: URIs', async () => {
    const out = await inlineHtmlUrls('<img src="logo.svg"><a href="#x">', 't/layouts/../x.html', read, []);
    assert.ok(out.includes('src="data:image/svg+xml;base64,'));
    assert.ok(out.includes('href="#x"'));
  });
});

describe('single-file export: whole shows (I-054)', () => {
  /** The import map and file table of a packed page. */
  const parse = (html) => {
    const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)[1]).imports;
    const files = JSON.parse(/<script type="application\/json" id="slipr-files">(.*?)<\/script>/s.exec(html)[1]);
    const decode = (uri) => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').toString('utf8');
    return { map, files, decode };
  };

  for (const showDir of ['shows/demo', 'shows/conclusion-demo']) {
    test(`${showDir}: a closed module graph, no relative URLs left, every show image included`, async () => {
      const result = await packShow({ readFile: readRepo, showDir });
      assert.deepEqual(result.warnings, []);
      const { map, files, decode } = parse(result.html);
      assert.ok(map[`${VIRTUAL_ROOT}viewer/js/main.js`], 'the entry module');
      for (const [url, uri] of Object.entries(map)) {
        if (!uri.startsWith('data:text/javascript')) continue;
        const code = decode(uri);
        assert.ok(!/\b(?:from|import)\s*\(?\s*["']\.{1,2}\//.test(code), `relative import left in ${url}`);
        assert.ok(!/\bimport\.meta\.url\b/.test(code), `import.meta.url left in ${url}`);
        for (const m of code.matchAll(/\b(?:from|import)\s*\(?\s*["'](https:\/\/slipr\.invalid\/[^"']+)["']/g)) {
          if (code.slice(Math.max(0, m.index - 3), m.index).includes('*')) continue;   // JSDoc type, not loaded
          assert.ok(map[m[1]], `${url} imports ${m[1]}, which is not in the import map`);
        }
      }
      for (const [path, file] of Object.entries(files)) {
        if (file.type === 'text/css') assert.ok(!/url\(\s*["']?(?!data:|#|https?:)[^"')]+/.test(file.text), `relative url() left in ${path}`);
        if (file.type === 'text/html' && path.startsWith('template/')) assert.ok(!/\bsrc="(?!data:|https?:)/.test(file.text), `relative src left in ${path}`);
      }
      const show = JSON.parse(files['show/show.json'].text);
      assert.equal(show.template.ref, '../template');
      assert.ok(files['template/template.json']);
      const { collectImagePaths } = await import('../validate.js');
      for (const src of collectImagePaths(show)) assert.ok(files[`show/${src}`], `image ${src} missing`);
    });
  }

  test('Mermaid only for shows with diagrams', async () => {
    const withDiagrams = JSON.stringify(JSON.parse(new TextDecoder().decode(await readRepo('shows/demo/show.json')))).includes('"mermaid"');
    const demo = parse((await packShow({ readFile: readRepo, showDir: 'shows/demo' })).html).map;
    const conclusion = parse((await packShow({ readFile: readRepo, showDir: 'shows/conclusion-demo' })).html).map;
    const hasMermaid = (map) => Object.keys(map).some((k) => k.includes('/mermaid'));
    assert.equal(hasMermaid(demo), withDiagrams);
    assert.equal(hasMermaid(conclusion), false);
  });

  test('a missing show folder is a clear error', async () => {
    await assert.rejects(packShow({ readFile: readRepo, showDir: 'shows/nope' }), /No show\.json/);
  });
});
