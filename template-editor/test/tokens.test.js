import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../../shared/test/helpers.js';
import {
  rootRules, parseTokens, setTokenValue, checkValue, linkedToken, resolveToken,
  fontFaceFamilies, addFontFace, rewriteCssUrls, cssUrls, rewriteHtmlUrls, htmlUrls, cleanFamily,
} from '../js/css-tokens.js';
import { parseColor, toHex, contrastRatio } from '../js/color.js';
import { buildCatalog, tokenKind, tokenLabel, linkCandidates, dependents } from '../js/token-catalog.js';
import { checkContrast } from '../js/contrast-pairs.js';

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const CSS = `/* header */
@import url("x.css");
@font-face { font-family: "Brand Sans"; src: url("assets/fonts/brand.woff2") format("woff2"); }

:root {
  /* Style guide: keep in sync */
  --a-red: #E63232;
  --slipr-color-accent: var(--a-red); /* the brand colour */
  --slipr-font-body: "Brand Sans", Arial, sans-serif;

  /* Sizes (in cqw, I-104) */
  --slipr-size-title: calc(24 * 0.1cqw);
  --x-url: url("data:image/svg+xml;a;b");
}
@media print { :root { --slipr-color-accent: black; } }
.slipr-slide { color: var(--slipr-color-accent); }
:root { --slipr-color-accent: var(--a-red); }
`;

describe('css tokens (I-106)', () => {
  test('finds top-level :root rules only', () => {
    const rules = rootRules(CSS);
    assert.equal(rules.length, 2);
    assert.ok(CSS.slice(rules[0].start).startsWith(':root {'));
  });

  test('parses declarations with groups, notes and exact offsets', () => {
    const tokens = parseTokens(CSS);
    assert.deepEqual(tokens.map((t) => t.name), ['--a-red', '--slipr-color-accent', '--slipr-font-body', '--slipr-size-title', '--x-url', '--slipr-color-accent']);
    const accent = tokens[1];
    assert.equal(accent.value, 'var(--a-red)');
    assert.equal(CSS.slice(accent.valueStart, accent.valueEnd), 'var(--a-red)');
    assert.equal(accent.group, 'Style guide');
    assert.equal(accent.groupNote, 'keep in sync');
    assert.equal(accent.note, 'the brand colour');
    assert.equal(tokens[3].group, 'Sizes');
    assert.equal(tokens[3].groupNote, 'in cqw');
    assert.equal(tokens[4].value, 'url("data:image/svg+xml;a;b")', 'a ; inside a string or url() does not end the value');
  });

  test('setTokenValue changes only the last declaration value', () => {
    const out = setTokenValue(CSS, '--slipr-color-accent', '#BC448C');
    assert.equal(out.length, CSS.length - 'var(--a-red)'.length + '#BC448C'.length);
    assert.ok(out.endsWith(':root { --slipr-color-accent: #BC448C; }\n'));
    assert.ok(out.includes('--slipr-color-accent: var(--a-red); /* the brand colour */'), 'the first one is untouched');
    assert.ok(out.includes('@media print { :root { --slipr-color-accent: black; } }'));
    assert.throws(() => setTokenValue(CSS, '--nope', 'red'), /not declared/);
    assert.throws(() => setTokenValue(CSS, '--a-red', 'red; } body { x: y'), /cannot contain/);
  });

  test('checkValue guards the stylesheet', () => {
    assert.equal(checkValue('#fff'), null);
    assert.equal(checkValue('"Brand Sans", Arial, sans-serif'), null);
    assert.equal(checkValue('calc(2 * var(--x))'), null);
    assert.match(checkValue(''), /empty/);
    assert.match(checkValue('red }'), /cannot contain/);
    assert.match(checkValue('red /* x */'), /comment/);
    assert.match(checkValue('"Brand'), /quote/);
    assert.match(checkValue('calc(1px'), /not closed/);
    assert.match(checkValue('1px)'), /no matching/);
    assert.match(checkValue('</style>'), /</);
  });

  test('links and resolving', () => {
    assert.equal(linkedToken('var(--a)'), '--a');
    assert.equal(linkedToken(' var( --a , red ) '), '--a');
    assert.equal(linkedToken('calc(var(--a) * 2)'), null);
    const values = new Map([['--a', '#111'], ['--b', 'var(--a)'], ['--c', 'var(--b)'], ['--loop1', 'var(--loop2)'], ['--loop2', 'var(--loop1)'], ['--fb', 'var(--missing, #222)']]);
    assert.equal(resolveToken('--c', values), '#111');
    assert.equal(resolveToken('--loop1', values), null);
    assert.equal(resolveToken('--fb', values), '#222');
    assert.equal(resolveToken('--none', values), null);
  });

  test('font faces: list and add', () => {
    assert.deepEqual(fontFaceFamilies(read('templates/conclusion/theme.css')), ['Source Serif 4']);
    const out = addFontFace(CSS, { family: 'Inter!', src: 'assets/fonts/inter.woff2', weight: '100 900' });
    const at = out.indexOf('@font-face {\n  font-family: "Inter";');
    assert.ok(at > 0 && at < out.indexOf(':root {'), 'inserted above the first :root rule');
    assert.match(out, /src: url\("assets\/fonts\/inter.woff2"\) format\("woff2"\);\n  font-weight: 100 900;/);
    assert.deepEqual(fontFaceFamilies(out), ['Brand Sans', 'Inter']);
    assert.throws(() => addFontFace(CSS, { family: 'X', src: '../evil.woff2' }));
    assert.throws(() => addFontFace(CSS, { family: '!!', src: 'a.woff2' }));
    assert.equal(cleanFamily(' Source  Serif 4 "x" '), 'Source Serif 4 x');
  });

  test('url rewriting in CSS and HTML', () => {
    assert.deepEqual(cssUrls(CSS), ['x.css', 'assets/fonts/brand.woff2']);
    const css = rewriteCssUrls('a{b:url(assets/a.svg)} c{d:url("data:x")} e{f:url(\'/abs.png\')}', (p) => `blob:${p}`);
    assert.equal(css, 'a{b:url("blob:assets/a.svg")} c{d:url("data:x")} e{f:url(\'/abs.png\')}');
    const html = '<img src="../assets/logo.svg" alt=""><a href="#x">x</a><img src="https://x/y.png">';
    assert.deepEqual(htmlUrls(html), ['../assets/logo.svg']);
    assert.equal(rewriteHtmlUrls(html, (p) => `blob:${p}`), '<img src="blob:../assets/logo.svg" alt=""><a href="#x">x</a><img src="https://x/y.png">');
  });

  test('every token of both templates round-trips through setTokenValue', () => {
    for (const file of ['templates/default/theme.css', 'templates/default/reader.css', 'templates/conclusion/theme.css', 'templates/conclusion/reader.css']) {
      const css = read(file);
      const tokens = parseTokens(css);
      assert.ok(tokens.length >= 7, `${file} has tokens`);
      for (const t of tokens) {
        assert.equal(checkValue(t.value), null, `${file} ${t.name}: ${t.value}`);
        if (t === tokens.filter((x) => x.name === t.name).pop()) assert.equal(setTokenValue(css, t.name, t.value), css);
      }
    }
  });
});

describe('colours and contrast (I-106)', () => {
  test('parses the colour syntaxes templates use', () => {
    assert.deepEqual(parseColor('#BC448C'), { r: 188, g: 68, b: 140, a: 1 });
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
    assert.equal(parseColor('#0008').a, 0.533);
    assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1 });
    assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
    assert.equal(toHex(parseColor('hsl(0 100% 50%)')), '#FF0000');
    assert.equal(toHex(parseColor('hsla(120, 100%, 25%, 1)')), '#008000');
    assert.equal(toHex(parseColor('White')), '#FFFFFF');
    assert.equal(parseColor('transparent').a, 0);
    assert.equal(parseColor('var(--x)'), null);
    assert.equal(parseColor('1.2cqw'), null);
    assert.equal(parseColor('#12345'), null);
  });

  test('contrast ratio matches WCAG', () => {
    assert.equal(contrastRatio(parseColor('#000'), parseColor('#fff')), 21);
    assert.equal(Math.floor(contrastRatio(parseColor('#767676'), parseColor('#fff')) * 100) / 100, 4.54);
  });
});

describe('token catalogue (I-106)', () => {
  const sheets = (id) => ({ theme: read(`templates/${id}/theme.css`), reader: read(`templates/${id}/reader.css`) });

  test('kinds, labels and the winning declaration', () => {
    const catalog = buildCatalog(sheets('conclusion'));
    const by = (name) => catalog.find((t) => t.name === name);
    assert.equal(catalog.filter((t) => t.name === '--slipr-color-info').length, 1, 'listed once');
    assert.equal(by('--slipr-color-info').sheet, 'reader');
    assert.equal(by('--slipr-color-info').value, 'var(--cnc-blue)', 'the last declaration wins');
    assert.equal(by('--slipr-color-info').resolved, '#1369AF');
    assert.equal(by('--slipr-color-accent').linked, '--cnc-magenta');
    assert.equal(by('--slipr-color-accent').kind, 'color');
    assert.equal(by('--cnc-font-heading').kind, 'font');
    assert.equal(by('--slipr-tag-cloud-font').kind, 'font');
    assert.equal(by('--cnc-size-title').kind, 'size');
    assert.equal(by('--slipr-reader-line').kind, 'size');
    assert.equal(by('--slipr-chapter-bar-visibility').kind, 'other');
    assert.equal(by('--cnc-font-heading').note.startsWith('Arial and Arial Black'), true, 'a long comment is a note, not a group');
    assert.equal(by('--cnc-font-heading').group, 'Style guide');
    assert.equal(tokenLabel('--slipr-table-header-bg'), 'Table header bg');
    assert.equal(tokenLabel('--cnc-magenta'), 'Magenta');
    assert.equal(tokenKind('--slipr-graph-1', '#fff'), 'color');
  });

  test('link candidates leave out loops; dependents follow chains', () => {
    const catalog = buildCatalog(sheets('conclusion'));
    const candidates = linkCandidates(catalog, '--cnc-magenta').map((t) => t.name);
    assert.ok(!candidates.includes('--slipr-color-accent'), 'accent links to magenta, so magenta cannot link to accent');
    assert.ok(candidates.includes('--cnc-blue'));
    assert.ok(!candidates.includes('--cnc-font-body'), 'only the same kind');
    assert.ok(dependents(catalog, '--cnc-magenta').includes('--slipr-color-accent'));
    assert.ok(dependents(catalog, '--cnc-magenta').includes('--slipr-tag-cloud-4'));
  });

  test('the contrast checks of both templates (known findings: chore C-009)', () => {
    const expected = {
      default: ['Accent (large text, graphics): 2', 'Tip callout title: 4.24', 'Warning callout title: 4.33', 'Graph colour 2: 2'],
      conclusion: ['Tip callout title: 3.27', 'Warning callout title: 4.31', 'Graph colour 3: 2.75'],
    };
    for (const id of ['default', 'conclusion']) {
      const results = checkContrast(buildCatalog(sheets(id)));
      assert.ok(results.length >= 15, `${id}: ${results.length} checks`);
      assert.deepEqual(results.filter((r) => !r.pass).map((r) => `${r.label}: ${r.ratio}`), expected[id], id);
    }
  });

  test('a failing pair is reported with its ratio', () => {
    const catalog = buildCatalog({ theme: ':root { --slipr-color-text: #999999; --slipr-color-bg: #ffffff; --slipr-color-muted: rgb(0 0 0 / 50%); }' });
    const results = checkContrast(catalog);
    assert.deepEqual(results.map((r) => [r.label, r.ratio, r.pass]), [['Body text', 2.84, false]], 'transparent colours are not checked');
  });
});
