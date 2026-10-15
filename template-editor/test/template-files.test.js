import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot, readJson } from '../../shared/test/helpers.js';
import { validateShow, validateTemplate } from '../../shared/validate.js';
import { buildCatalog } from '../js/token-catalog.js';
import { setTokenValue, fontFaceFamilies } from '../js/css-tokens.js';
import {
  joinPath, referencedFiles, optionalFiles, idFromName, isTemplateId, cloneTemplateJson, cloneReadme,
  styleguideLinks, syncStyleguide, isTextFile, familyFromFileName, supportsFourThree,
} from '../js/template-files.js';
import { patchJsonText, valueSpans } from '../js/json-text.js';
import { generatedSample, fitSample, bestSample, sampleValue, withAspect } from '../js/sample-show.js';

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readOrNull = (id) => (path) => {
  const full = resolve(repoRoot, 'templates', id, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
};

describe('template files (I-106)', () => {
  test('joinPath stays inside the template folder', () => {
    assert.equal(joinPath('layouts/title.html', '../assets/logos/logo.svg'), 'assets/logos/logo.svg');
    assert.equal(joinPath('theme.css', 'assets/fonts/a%20b.woff2'), 'assets/fonts/a b.woff2');
    assert.equal(joinPath('theme.css', './x.png?v=1#y'), 'x.png');
    assert.equal(joinPath('theme.css', '../outside.png'), null);
    assert.equal(joinPath('theme.css', 'https://x/y.png'), null);
    assert.equal(joinPath('theme.css', '/abs.png'), null);
  });

  test('referencedFiles finds every file both templates use, and they exist', () => {
    for (const id of ['default', 'conclusion']) {
      const template = readJson(`templates/${id}/template.json`);
      const files = referencedFiles(template, readOrNull(id));
      assert.ok(files.includes('template.json') && files.includes('theme.css') && files.includes('reader.css'));
      assert.ok(files.some((f) => f.startsWith('assets/')), `${id} has assets`);
      for (const f of files) assert.ok(existsSync(resolve(repoRoot, 'templates', id, f)), `${id}/${f} exists`);
    }
    const conclusion = referencedFiles(readJson('templates/conclusion/template.json'), readOrNull('conclusion'));
    assert.ok(conclusion.includes('assets/fonts/source-serif-4-latin-opsz-normal.woff2'));
    assert.ok(conclusion.includes('assets/logos/conclusion-logo.png'));
    const extra = optionalFiles(conclusion, fontFaceFamilies(read('templates/conclusion/theme.css')));
    assert.ok(extra.includes('README.md'));
    assert.ok(extra.includes('assets/fonts/SourceSerif4-OFL.txt'), 'the font licence is tried');
    assert.deepEqual(optionalFiles(['template.json'], []), ['README.md'], 'no fonts, no licence probes');
    assert.ok(supportsFourThree(read('templates/default/theme.css')));
    assert.ok(!supportsFourThree(read('templates/conclusion/theme.css')));
  });

  test('ids, text files and clone metadata', () => {
    assert.equal(idFromName('Acme Brand (2026)!'), 'acme-brand-2026');
    assert.equal(idFromName('Café Noël'), 'cafe-noel');
    assert.equal(familyFromFileName('inter-variable-latin.woff2'), 'Inter');
    assert.equal(familyFromFileName('SourceSerif4-Regular.ttf'), 'SourceSerif4');
    assert.equal(familyFromFileName('open_sans-bold.woff'), 'Open Sans');
    assert.equal(familyFromFileName('123.woff2'), 'Brand');
    assert.ok(isTemplateId('acme-2'));
    assert.ok(!isTemplateId('Acme') && !isTemplateId('a--b') && !isTemplateId(''));
    assert.ok(isTextFile('theme.css') && isTextFile('layouts/a.html') && isTextFile('assets/x.svg'));
    assert.ok(!isTextFile('assets/fonts/a.woff2') && !isTextFile('logo.png'));
    const source = readJson('templates/default/template.json');
    const clone = cloneTemplateJson(source, { id: 'acme', name: 'Acme', date: '2026-10-15' });
    assert.deepEqual(Object.keys(clone), Object.keys(source), 'key order kept');
    assert.equal(clone.version, '0.1.0');
    assert.match(clone.description, /Slipr Default/);
    assert.ok(validateTemplate(clone).ok);
    const readme = cloneReadme(clone, source, '2026-10-15');
    assert.match(readme, /^# Acme\n/);
    assert.match(readme, /\| `two-column` \| Two columns \| title, leftTitle, left, rightTitle, right \|/);
  });

  test('style guide colours follow their tokens', () => {
    const conclusion = readJson('templates/conclusion/template.json');
    const sheets = { theme: read('templates/conclusion/theme.css'), reader: read('templates/conclusion/reader.css') };
    const catalog = buildCatalog(sheets);
    const links = styleguideLinks(conclusion, catalog);
    assert.equal(links.get('magenta'), '--cnc-magenta');
    assert.equal(links.get('magenta-10'), '--cnc-magenta-10');
    assert.equal(links.get('light-grey'), '--cnc-grey', 'by value');
    assert.equal(links.size, Object.keys(conclusion.styleguide.colors).length);
    assert.equal(syncStyleguide(conclusion, links, catalog), conclusion, 'unchanged when in sync');

    const edited = buildCatalog({ ...sheets, theme: setTokenValue(sheets.theme, '--cnc-magenta', '#a03070') });
    const synced = syncStyleguide(conclusion, links, edited);
    assert.equal(synced.styleguide.colors.magenta, '#A03070');
    assert.equal(synced.styleguide.colors.blue, conclusion.styleguide.colors.blue);

    const def = readJson('templates/default/template.json');
    const defLinks = styleguideLinks(def, buildCatalog({ theme: read('templates/default/theme.css') }));
    assert.equal(defLinks.get('background'), '--slipr-color-bg');
    assert.equal(defLinks.get('primary'), '--slipr-color-primary');
  });
});

describe('template.json kept as written (I-106)', () => {
  test('value spans', () => {
    const text = '{ "a": [1, { "b": "x\\"y" }], "c": true }';
    const spans = valueSpans(text);
    const b = spans.get('["a",1,"b"]');
    assert.equal(text.slice(b.start, b.end), '"x\\"y"');
    const c = spans.get('["c"]');
    assert.equal(text.slice(c.start, c.end), 'true');
  });

  test('a changed value is patched in place; a new key rewrites the file', () => {
    for (const id of ['default', 'conclusion']) {
      const text = read(`templates/${id}/template.json`);
      const original = JSON.parse(text);
      assert.equal(patchJsonText(text, original, structuredClone(original)), text, 'unchanged');
      const updated = structuredClone(original);
      updated.name = 'New "name"';
      updated.styleguide.colors[Object.keys(updated.styleguide.colors)[0]] = '#123456';
      const out = patchJsonText(text, original, updated);
      assert.deepEqual(JSON.parse(out), updated);
      assert.equal(out.split('\n').length, text.split('\n').length, `${id}: same lines`);
      assert.ok(out.includes('"name": "New \\"name\\""'));
    }
    const text = '{\n  "a": 1\n}\n';
    assert.equal(patchJsonText(text, { a: 1 }, { a: 1, b: 2 }), '{\n  "a": 1,\n  "b": 2\n}\n');
  });
});

describe('sample shows (I-106)', () => {
  test('the generated sample has a slide per layout and validates against both templates', () => {
    for (const id of ['default', 'conclusion']) {
      const template = readJson(`templates/${id}/template.json`);
      const show = generatedSample(template);
      assert.equal(show.slides.length, template.layouts.length);
      const result = validateShow(show, { template });
      assert.deepEqual(result.errors, [], id);
      assert.ok(show.slides.some((s) => s.reader?.blocks?.length >= 6), 'reader blocks of every simple kind');
    }
  });

  test('sample values respect limits; file-based types stay empty', () => {
    assert.equal(sampleValue({ name: 'title', type: 'text', maxLength: 5 }), 'Quiet');
    assert.equal(sampleValue({ name: 'body', type: 'list', maxItems: 2 }).split('\n').length, 2);
    assert.match(sampleValue({ name: 'img', type: 'image' }).src, /^data:image\/svg\+xml/);
    assert.equal(sampleValue({ name: 'doc', type: 'pdf' }), undefined);
    assert.equal(sampleValue({ name: 'w', type: 'web' }), undefined);
    const cards = sampleValue({ name: 'c', type: 'cards', maxItems: 2, fields: [{ name: 'title', type: 'text', maxLength: 3 }, { name: 'image', type: 'image' }] });
    assert.equal(cards.length, 2);
    assert.equal(cards[0].title, 'Ana');
  });

  test('fitting the demos and picking the best sample', () => {
    const def = readJson('templates/default/template.json');
    const conclusion = readJson('templates/conclusion/template.json');
    const shows = new Map([['demo', readJson('shows/demo/show.json')], ['conclusion-demo', readJson('shows/conclusion-demo/show.json')]]);
    assert.equal(bestSample(def, shows), 'demo');
    assert.equal(bestSample(conclusion, shows), 'conclusion-demo');
    assert.equal(bestSample({ layouts: [{ id: 'nothing' }] }, shows), 'generated');
    const fit = fitSample(shows.get('demo'), conclusion);
    assert.ok(fit.kept < fit.total);
    assert.ok(fit.show.slides.every((s) => conclusion.layouts.some((l) => l.id === s.layout)));
    assert.equal(withAspect(shows.get('demo'), '4:3').settings.aspectRatio, '4:3');
  });
});
