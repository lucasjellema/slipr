import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../../shared/test/helpers.js';
import { parseColor, contrastRatio } from '../js/color.js';

const css = readFileSync(resolve(repoRoot, 'template-editor/css/template-editor.css'), 'utf8');

/** The --slipr-te-* colours of the rule that starts with `selector`. */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start !== -1, selector);
  const body = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/--slipr-te-([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  return out;
}

const AA = 4.5;
const UI = 3;
const pairs = [
  ...['bg', 'surface', 'surface-raised'].flatMap((bg) => ['text', 'muted', 'link', 'danger', 'success'].map((fg) => [fg, bg, AA])),
  ['warning', 'surface', AA],
  ['on-accent', 'accent', AA],
  ['on-accent', 'accent-hover', AA],
  ...['bg', 'surface', 'surface-raised'].map((bg) => ['indicator', bg, UI]),
];

describe('template editor themes (I-106)', () => {
  for (const [name, selector] of [['dark', ':root'], ['light', ':root[data-theme="light"]']]) {
    test(`${name}: WCAG AA for every text and indicator pair`, () => {
      const theme = tokens(selector);
      const failures = [];
      for (const [fg, bg, min] of pairs) {
        assert.ok(theme[fg] && theme[bg], `${name}: ${fg} or ${bg} missing`);
        const ratio = contrastRatio(parseColor(theme[fg]), parseColor(theme[bg]));
        if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
      }
      assert.deepEqual(failures, []);
    });
  }

  test('both themes define the same tokens; no hard-coded colours outside them', () => {
    assert.deepEqual(Object.keys(tokens(':root')).sort(), Object.keys(tokens(':root[data-theme="light"]')).sort());
    const rest = css.slice(css.indexOf('* { box-sizing'));
    assert.deepEqual(rest.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [], []);
  });
});
