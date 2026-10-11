import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../../shared/test/helpers.js';
import { resolveTheme } from '../js/theme.js';

/** The custom properties in the CSS rule that starts with `selector`. */
function tokens(file, selector, prefix) {
  const css = readFileSync(resolve(repoRoot, file), 'utf8');
  const start = css.indexOf(`${selector} {`);
  assert.ok(start !== -1, `${selector} in ${file}`);
  const body = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(new RegExp(`--${prefix}-([\\w-]+):\\s*(#[0-9A-Fa-f]{6})`, 'g'))) out[m[1]] = m[2];
  return out;
}

/** WCAG relative luminance and contrast ratio. */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Check pairs [foreground, background, minimum]; report every failure at once. */
function check(theme, pairs) {
  const failures = [];
  for (const [fg, bg, min] of pairs) {
    assert.ok(theme[fg] && theme[bg], `token ${fg} or ${bg} missing`);
    const ratio = contrast(theme[fg], theme[bg]);
    if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
  }
  assert.deepEqual(failures, []);
}

const AA = 4.5;   // normal text
const UI = 3;     // focus outlines and other non-text indicators

const editorPairs = [
  ...['bg', 'surface', 'surface-raised', 'selected', 'hover'].map((bg) => ['text', bg, AA]),
  ...['bg', 'surface', 'surface-raised', 'selected'].map((bg) => ['muted', bg, AA]),
  ...['link', 'accent-hover', 'danger', 'warning', 'success-text'].flatMap((fg) => ['bg', 'surface', 'surface-raised'].map((bg) => [fg, bg, AA])),
  ['text-strong', 'hover', AA],
  ...['accent', 'success', 'success-hover', 'danger-strong', 'danger-strong-hover', 'accent-2', 'accent-2-hover'].map((bg) => ['on-color', bg, AA]),
  ['accent-hover', 'bg', UI],
  ...['bg', 'surface', 'surface-raised', 'selected'].map((bg) => ['indicator', bg, UI]),
];

describe('editor themes (I-082)', () => {
  for (const [name, selector] of [['dark', ':root'], ['light', ':root[data-theme="light"]']]) {
    test(`${name} theme: WCAG AA contrast for every text and indicator pair`, () => {
      check(tokens('editor/css/editor.css', selector, 'slipr-editor'), editorPairs);
    });
  }

  test('both themes define the same tokens', () => {
    const dark = Object.keys(tokens('editor/css/editor.css', ':root', 'slipr-editor')).sort();
    const light = Object.keys(tokens('editor/css/editor.css', ':root[data-theme="light"]', 'slipr-editor')).sort();
    assert.deepEqual(light, dark);
  });

  test('no theme colour is hard-coded outside the token blocks', () => {
    const css = readFileSync(resolve(repoRoot, 'editor/css/editor.css'), 'utf8');
    const rest = css.slice(css.indexOf('}', css.indexOf(':root[data-theme="light"] {')) + 1);
    const hex = [...rest.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0]);
    // Allowed: white behind slide thumbnails, and template fallbacks inside var(--slipr-color-…, #…).
    const fallbacks = [...rest.matchAll(/var\(--slipr-color-[\w-]+,\s*(#[0-9A-Fa-f]{6})\)/g)].map((m) => m[1]);
    const unexpected = hex.filter((h) => h.toUpperCase() !== '#FFFFFF' && !fallbacks.includes(h));
    assert.deepEqual(unexpected, []);
  });

  test('the manual (help.css) in both themes', () => {
    const helpPairs = [
      ...['bg', 'surface', 'note', 'tip'].map((bg) => ['text', bg, AA]),
      ...['bg', 'surface'].map((bg) => ['muted', bg, AA]),
      ...['bg', 'surface', 'note'].map((bg) => ['accent', bg, AA]),
      ['error', 'bg', AA],
      ['warning', 'bg', AA],
    ];
    check(tokens('editor/css/help.css', ':root', 'slipr-help'), helpPairs);
    check(tokens('editor/css/help.css', ':root[data-theme="dark"]', 'slipr-help'), helpPairs);
  });

  test('resolveTheme: an explicit choice wins; System follows the setting', () => {
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('dark', true), 'dark');
    assert.equal(resolveTheme('system', true), 'light');
    assert.equal(resolveTheme('system', false), 'dark');
    assert.equal(resolveTheme(null, true), 'light');
    assert.equal(resolveTheme('rubbish', false), 'dark');
  });
});
