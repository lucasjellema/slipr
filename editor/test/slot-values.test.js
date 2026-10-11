import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, clone, codes } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import {
  describeValue,
  imageValue,
  listValue,
  slotEditorKind,
  textareaText,
  textValue,
} from '../js/slot-values.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const conclusionDemo = readJson('shows/conclusion-demo/show.json');
const conclusion = readJson('templates/conclusion/template.json');

describe('slot values: editor kind per slot type (E-010)', () => {
  test('text, richtext, list and image are editable', () => {
    assert.equal(slotEditorKind('text'), 'text');
    assert.equal(slotEditorKind('richtext'), 'textarea');
    assert.equal(slotEditorKind('list'), 'textarea');
    assert.equal(slotEditorKind('image'), 'image');
  });

  test('chart, diagram and unknown types are read-only (quote, code, cards have editors since I-035)', () => {
    for (const type of ['chart', 'diagram', 'something-new']) {
      assert.equal(slotEditorKind(type, {}), 'readonly', type);
    }
  });

  test('without a slot definition, only string values are editable', () => {
    assert.equal(slotEditorKind(undefined, 'Hello'), 'text');
    assert.equal(slotEditorKind(undefined, undefined), 'text');
    assert.equal(slotEditorKind(undefined, { src: 'x.png' }), 'readonly');
    assert.equal(slotEditorKind(undefined, [{ title: 'a' }]), 'readonly');
  });
});

describe('slot values: shapes written by the form (E-010)', () => {
  test('image edits write { src, alt } and keep fit and focus', () => {
    const prev = { src: 'images/a.png', alt: 'A', fit: 'cover', focus: 'top' };
    assert.deepEqual(imageValue(prev, { src: 'images/b.png' }), { src: 'images/b.png', alt: 'A', fit: 'cover', focus: 'top' });
    assert.deepEqual(imageValue(prev, { alt: 'B' }), { ...prev, alt: 'B' });
  });

  test('image from nothing, or from a legacy bare string, becomes an object', () => {
    assert.deepEqual(imageValue(undefined, { src: 'images/x.png' }), { src: 'images/x.png' });
    assert.deepEqual(imageValue('images/x.png', { alt: 'X' }), { src: 'images/x.png', alt: 'X' });
  });

  test('empty image src removes the slot; empty alt is left out', () => {
    assert.equal(imageValue({ src: 'images/a.png', alt: 'A' }, { src: '' }), undefined);
    assert.deepEqual(imageValue({ src: 'images/a.png', alt: 'A' }, { alt: '' }), { src: 'images/a.png' });
  });

  test('a list that was an array stays an array of strings', () => {
    assert.equal(textareaText(['One', 'Two']), 'One\nTwo');
    assert.deepEqual(listValue(['One', 'Two'], 'One\n\nTwo\nThree'), ['One', 'Two', 'Three']);
    assert.equal(listValue(['One'], '\n'), undefined);
  });

  test('a Markdown list stays a string', () => {
    assert.equal(listValue('- a', '- a\n- b'), '- a\n- b');
    assert.equal(listValue(undefined, '- a'), '- a');
    assert.equal(listValue('- a', ''), undefined);
  });

  test('empty text removes the slot', () => {
    assert.equal(textValue(''), undefined);
    assert.equal(textValue('Hi'), 'Hi');
  });

  test('read-only summaries never show [object Object]', () => {
    assert.equal(describeValue('cards', [{}, {}]), '2 cards');
    assert.equal(describeValue('quote', { text: 'Less is more', source: 'Mies' }), '“Less is more” (Mies)');
    assert.equal(describeValue('code', { language: 'js', code: 'a\nb' }), 'js, 2 lines');
    assert.equal(describeValue('quote', undefined), '(empty)');
    assert.ok(!describeValue('chart', { kind: 'bar' }).includes('[object'));
  });
});

describe('slot values: edited shows stay valid (E-010)', () => {
  test('editing an image slot through setSlot keeps the demo show valid', () => {
    const slide = demo.slides.find((s) => s.content?.image);
    assert.ok(slide, 'demo has a slide with an image slot');
    const value = imageValue(slide.content.image, { src: 'images/two-modes.svg', alt: 'Changed' });
    const next = actions.setSlot(demo, { slideId: slide.id, slot: 'image', value });
    const result = validateShow(next, { template });
    assert.deepEqual(result.errors, []);
  });

  test('the validator catches the old bug: an image slot as a bare string', () => {
    const slide = demo.slides.find((s) => s.content?.image);
    const broken = actions.setSlot(demo, { slideId: slide.id, slot: 'image', value: 'images/two-modes.svg' });
    assert.ok(codes(validateShow(broken, { template }).errors).includes('slot-type'));
  });

  test('every slot in the conclusion demo is either editable with a valid shape or read-only', () => {
    const layouts = new Map(conclusion.layouts.map((l) => [l.id, l]));
    let show = clone(conclusionDemo);
    for (const slide of conclusionDemo.slides) {
      for (const slot of layouts.get(slide.layout)?.slots ?? []) {
        const prev = slide.content?.[slot.name];
        const kind = slotEditorKind(slot.type, prev);
        let value;
        if (kind === 'image') value = imageValue(prev, { alt: 'Edited' }) ?? { src: 'images/x.png', alt: 'Edited' };
        else if (kind === 'textarea') value = slot.type === 'list' ? listValue(prev, textareaText(prev) || '- Edited') : textValue('Edited');
        else if (kind === 'text') value = textValue('Edited');
        else continue;
        show = actions.setSlot(show, { slideId: slide.id, slot: slot.name, value });
      }
    }
    const typeErrors = validateShow(show, { template: conclusion }).errors.filter((e) => e.code === 'slot-type');
    assert.deepEqual(typeErrors, []);
  });
});

test('imageValue: fit can be set and cleared (E-015)', () => {
  const img = { src: 'images/a.png', alt: 'A' };
  assert.deepEqual(imageValue(img, { fit: 'contain' }), { src: 'images/a.png', alt: 'A', fit: 'contain' });
  assert.deepEqual(imageValue({ ...img, fit: 'cover' }, { fit: undefined }), img);
});
