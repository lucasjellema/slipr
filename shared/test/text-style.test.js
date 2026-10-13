import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { textStyleDeclarations, cleanTextStyle, hexToRgba, isHexColor } from '../text-style.js';

const css = (style) => Object.fromEntries(textStyleDeclarations(style));

describe('text element style (D-016, I-089)', () => {
  test('without a style: the template body font and size, left and top', () => {
    const d = css(undefined);
    assert.equal(d['font-family'], 'var(--slipr-font-body, system-ui, sans-serif)');
    assert.equal(d['font-size'], 'var(--slipr-size-body, 2.2cqw)');
    assert.equal(d['text-align'], 'left');
    assert.equal(d['justify-content'], 'flex-start');
    assert.equal(d.color, undefined, 'inherits the template text color');
    assert.equal(d['background-color'], undefined);
  });

  test('fonts, sizes and text options', () => {
    const d = css({ font: 'heading', size: 'title', bold: true, italic: true, underline: true, uppercase: true, align: 'center', valign: 'bottom' });
    assert.match(d['font-family'], /--slipr-font-heading/);
    assert.equal(d['font-size'], 'var(--slipr-size-title, 3.6cqw)');
    assert.equal(d['font-weight'], '700');
    assert.equal(d['font-style'], 'italic');
    assert.equal(d['text-decoration'], 'underline');
    assert.equal(d['text-transform'], 'uppercase');
    assert.equal(d['text-align'], 'center');
    assert.equal(d['justify-content'], 'flex-end');
    assert.equal(css({ size: 1.6 })['font-size'], '1.6cqw');
    assert.equal(css({ size: 99 })['font-size'], '20cqw', 'clamped');
    assert.match(css({ font: 'mono' })['font-family'], /--slipr-font-code/);
  });

  test('colors, fill opacity, border, radius, outline, padding', () => {
    const d = css({ color: '#fff', background: '#BC448C', backgroundOpacity: 0.5, borderWidth: 0.2, borderStyle: 'dashed', borderColor: '#000000', radius: 2, outlineWidth: 0.1, outlineColor: '#000', padding: 0.8 });
    assert.equal(d.color, '#fff');
    assert.equal(d['background-color'], 'rgba(188, 68, 140, 0.5)');
    assert.equal(d.border, '0.2cqw dashed #000000');
    assert.equal(d['border-radius'], '2cqw');
    assert.equal(d['-webkit-text-stroke'], '0.2cqw #000');
    assert.equal(d['paint-order'], 'stroke fill');
    assert.equal(d.padding, '0.8cqw');
    assert.equal(css({ borderWidth: 0.1 }).border, '0.1cqw solid currentColor');
  });

  test('nothing unchecked reaches CSS', () => {
    const d = css({ font: 'x; background: url(evil)', color: 'red;}', background: 'url(x)', size: '10px', align: 'x', borderStyle: 'groove', borderWidth: 1 });
    for (const value of Object.values(d)) assert.doesNotMatch(value, /evil|url|red|10px|groove/);
    assert.equal(d.color, undefined);
    assert.equal(d['background-color'], undefined);
  });

  test('hex colors', () => {
    assert.equal(hexToRgba('#abc', 1), 'rgb(170, 187, 204)');
    assert.equal(hexToRgba('#000000', 0.25), 'rgba(0, 0, 0, 0.25)');
    assert.ok(isHexColor('#A1b2C3'));
    assert.ok(!isHexColor('#abcd'));
    assert.ok(!isHexColor('blue'));
  });

  test('cleanTextStyle drops defaults, invalid values and unknown keys', () => {
    assert.equal(cleanTextStyle({ font: 'body', size: 'body', align: 'left', valign: 'top', bold: false }), undefined);
    assert.equal(cleanTextStyle(null), undefined);
    assert.deepEqual(cleanTextStyle({ font: 'heading', size: 30, color: 'red', background: '#fff', backgroundOpacity: 1, borderStyle: 'dashed', extra: 1, padding: 0 }),
      { font: 'heading', size: 20, background: '#fff' });
    assert.deepEqual(cleanTextStyle({ borderWidth: 0.2, borderStyle: 'dotted', borderColor: '#000', outlineColor: '#fff' }),
      { borderWidth: 0.2, borderStyle: 'dotted', borderColor: '#000' });
    assert.deepEqual(Object.keys(cleanTextStyle({ padding: 1, uppercase: true, font: 'mono' })), ['font', 'uppercase', 'padding'], 'schema key order');
  });
});
