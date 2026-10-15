import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { repoRoot } from '../../shared/test/helpers.js';
import {
  openTemplate, catalogOf, setToken, setMeta, setStyleguideFont, addFont, withFamilyFirst, relativePath,
  outputFiles, changedPaths, markSaved, asClone,
} from '../js/actions.js';
import { createStore } from '../js/store.js';
import { cloneTemplateJson, cloneReadme, isTextFile } from '../js/template-files.js';
import { fontFaceFamilies } from '../js/css-tokens.js';
import { validateTemplate } from '../../shared/validate.js';

/** Every file of a template folder, text as strings and the rest as Blobs. */
function readTemplate(id) {
  const root = resolve(repoRoot, 'templates', id);
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(root, full).replaceAll('\\', '/');
        files.set(path, isTextFile(path) ? readFileSync(full, 'utf8') : new Blob([readFileSync(full)]));
      }
    }
  };
  walk(root);
  return files;
}

describe('template editor actions (I-106)', () => {
  test('opening: nothing changed, the catalogue and style guide links are there', () => {
    const state = openTemplate(readTemplate('conclusion'));
    assert.deepEqual(changedPaths(state), []);
    assert.ok(catalogOf(state).length > 60);
    assert.equal(catalogOf(state), catalogOf(state), 'cached');
    assert.equal(state.links.get('magenta'), '--cnc-magenta');
    assert.equal(outputFiles(state).get('template.json'), state.saved.get('template.json'));
    assert.throws(() => openTemplate(new Map([['theme.css', '']])), /no template.json/);
  });

  test('a token change touches one file; the style guide follows on save', () => {
    const before = openTemplate(readTemplate('conclusion'));
    const after = setToken(before, '--cnc-magenta', '#A03070');
    assert.notEqual(after.files, before.files);
    assert.deepEqual(changedPaths(after), ['template.json', 'theme.css']);
    const out = outputFiles(after);
    assert.equal(JSON.parse(out.get('template.json')).styleguide.colors.magenta, '#A03070');
    const lines = (t) => t.split('\n');
    const diff = lines(out.get('theme.css')).filter((l, i) => l !== lines(before.files.get('theme.css'))[i]);
    assert.deepEqual(diff, ['  --cnc-magenta: #A03070;']);
    const accent = catalogOf(after).find((t) => t.name === '--slipr-color-accent');
    assert.equal(accent.resolved, '#A03070', 'linked tokens follow');
    assert.equal(setToken(after, '--cnc-magenta', '#A03070'), after, 'same value: same state');
    assert.equal(catalogOf(setToken(before, '--slipr-color-info', '#123456')).find((t) => t.name === '--slipr-color-info').sheet, 'reader');
    assert.deepEqual(changedPaths(setToken(before, '--slipr-color-info', '#123456')), ['reader.css']);

    const saved = markSaved(after, out);
    assert.deepEqual(changedPaths(saved), []);
  });

  test('metadata and style guide fonts', () => {
    const state = openTemplate(readTemplate('default'));
    const next = setStyleguideFont(setMeta(state, 'name', 'Acme'), 'heading', 'Inter');
    const json = JSON.parse(outputFiles(next).get('template.json'));
    assert.equal(json.name, 'Acme');
    assert.equal(json.styleguide.fonts.heading, 'Inter');
    assert.throws(() => setMeta(state, 'layouts', 'x'));
  });

  test('adding a font: file, @font-face and the token', () => {
    const state = openTemplate(readTemplate('default'));
    const next = addFont(state, { fileName: 'Inter Var.WOFF2', blob: new Blob(['x']), family: 'Inter', weight: '100 900', token: '--slipr-font-heading' });
    assert.ok(next.files.get('assets/fonts/inter-var.woff2') instanceof Blob);
    const theme = next.files.get('theme.css');
    assert.deepEqual(fontFaceFamilies(theme), ['Inter']);
    assert.match(theme, /src: url\("assets\/fonts\/inter-var.woff2"\)/);
    assert.match(catalogOf(next).find((t) => t.name === '--slipr-font-heading').value, /^"Inter", system-ui, "Segoe UI"/);
    const again = addFont(next, { fileName: 'inter-var.woff2', blob: new Blob(['y']), family: 'Inter 2' });
    assert.ok(again.files.has('assets/fonts/inter-var-2.woff2'));
    assert.throws(() => addFont(state, { fileName: 'x.exe', blob: new Blob([]), family: 'X' }), /woff2/);
    assert.equal(withFamilyFirst('Inter, "Arial", sans-serif', 'Arial'), '"Arial", Inter, sans-serif');
    assert.equal(relativePath('theme.css', 'assets/fonts/a.woff2'), 'assets/fonts/a.woff2');
    assert.equal(relativePath('css/theme.css', 'assets/a.woff2'), '../assets/a.woff2');
  });

  test('a clone keeps template.json formatting and needs a full save', () => {
    const state = openTemplate(readTemplate('default'));
    const template = cloneTemplateJson(state.template, { id: 'acme', name: 'Acme', date: '2026-10-15' });
    const clone = asClone(state, { template, readme: cloneReadme(template, state.template, '2026-10-15') });
    const out = outputFiles(clone);
    const text = out.get('template.json');
    assert.equal(text.split('\n').length, state.templateText.split('\n').length, 'patched, not reformatted');
    assert.ok(validateTemplate(JSON.parse(text)).ok);
    assert.ok(changedPaths(clone).length === out.size, 'every file is new');
    assert.match(out.get('README.md'), /^# Acme/);
  });

  test('store: undo, redo, coalescing and replace', () => {
    const store = createStore(openTemplate(readTemplate('default')));
    const seen = [];
    store.subscribe((_s, info) => seen.push(info.kind));
    const first = store.get();
    store.update((s) => setToken(s, '--slipr-color-accent', '#111111'), { coalesceKey: 'a' });
    store.update((s) => setToken(s, '--slipr-color-accent', '#222222'), { coalesceKey: 'a' });
    store.update((s) => setToken(s, '--slipr-color-primary', '#333333'));
    store.update((s) => s); // no change, no step
    store.undo();
    assert.equal(catalogOf(store.get()).find((t) => t.name === '--slipr-color-accent').value, '#222222');
    store.undo();
    assert.equal(store.get(), first, 'typing in one field was one step');
    assert.ok(!store.canUndo() && store.canRedo());
    store.redo();
    assert.equal(catalogOf(store.get()).find((t) => t.name === '--slipr-color-accent').value, '#222222');
    store.replace(first);
    assert.ok(!store.canUndo() && !store.canRedo());
    assert.deepEqual(seen, ['update', 'update', 'update', 'undo', 'undo', 'redo', 'replace']);
  });
});
