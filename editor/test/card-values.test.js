import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, clone } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import {
  addCard, cardsArray, cardsValue, codeValue, lengthHint, moveCard, quoteValue, removeCard, withCardField,
} from '../js/card-values.js';
import { slotEditorKind } from '../js/slot-values.js';

const conclusion = readJson('templates/conclusion/template.json');
const conclusionDemo = readJson('shows/conclusion-demo/show.json');

describe('cards values (I-035)', () => {
  const cards = [{ title: 'A', text: 'a' }, { title: 'B' }, { title: 'C' }];

  test('set and clear a field, without touching the input', () => {
    const next = withCardField(cards, 1, 'text', 'b');
    assert.deepEqual(next[1], { title: 'B', text: 'b' });
    assert.deepEqual(cards[1], { title: 'B' }, 'immutable');
    assert.deepEqual(withCardField(next, 1, 'text', '')[1], { title: 'B' });
    assert.deepEqual(withCardField(next, 1, 'text', undefined)[1], { title: 'B' });
  });

  test('add (up to maxItems), remove and move cards', () => {
    assert.equal(addCard(cards).length, 4);
    assert.deepEqual(addCard(cards).at(-1), {});
    assert.equal(addCard(cards, 3).length, 3, 'maxItems reached');
    assert.deepEqual(removeCard(cards, 0).map((c) => c.title), ['B', 'C']);
    assert.deepEqual(moveCard(cards, 0, 2).map((c) => c.title), ['B', 'C', 'A']);
    assert.deepEqual(moveCard(cards, 2, 0).map((c) => c.title), ['C', 'A', 'B']);
    assert.deepEqual(moveCard(cards, 1, 99).map((c) => c.title), ['A', 'C', 'B'], 'clamped');
  });

  test('no cards removes the slot; junk becomes empty cards', () => {
    assert.equal(cardsValue([]), undefined);
    assert.deepEqual(cardsArray('x'), []);
    assert.deepEqual(cardsArray([null, 'x', { a: 1 }]), [{}, {}, { a: 1 }]);
  });

  test('edited cards keep the conclusion demo valid without new errors', () => {
    const slide = conclusionDemo.slides.find((s) => s.layout === 'columns-4');
    let value = withCardField(slide.content.cards, 0, 'title', 'Nieuw');
    value = addCard(value, 4);
    value = withCardField(value, value.length - 1, 'title', 'Vier');
    const next = actions.setSlot(conclusionDemo, { slideId: slide.id, slot: 'cards', value: cardsValue(value) });
    assert.deepEqual(validateShow(next, { template: conclusion }).errors, []);
  });
});

describe('quote and code values', () => {
  test('quote: { text, source? }, both empty removes the slot', () => {
    assert.deepEqual(quoteValue(undefined, { text: 'Less is more' }), { text: 'Less is more' });
    assert.deepEqual(quoteValue({ text: 'Q' }, { source: 'Mies' }), { text: 'Q', source: 'Mies' });
    assert.deepEqual(quoteValue({ text: 'Q', source: 'Mies' }, { source: '' }), { text: 'Q' });
    assert.equal(quoteValue({ text: 'Q' }, { text: '' }), undefined);
  });

  test('code: { language?, code }, both empty removes the slot', () => {
    assert.deepEqual(codeValue(undefined, { code: 'x = 1' }), { code: 'x = 1' });
    assert.deepEqual(codeValue({ code: 'x' }, { language: ' js ' }), { code: 'x', language: 'js' });
    assert.deepEqual(codeValue({ code: 'x', language: 'js' }, { language: '' }), { code: 'x' });
    assert.equal(codeValue({ code: 'x' }, { code: '' }), undefined);
  });

  test('length hints', () => {
    assert.deepEqual(lengthHint('Hello', 18), { text: '5 / 18', over: false });
    assert.deepEqual(lengthHint('x'.repeat(20), 18), { text: '20 / 18', over: true });
    assert.equal(lengthHint('x', undefined), null);
  });

  test('quote, code and cards slots now have editors', () => {
    assert.equal(slotEditorKind('quote'), 'quote');
    assert.equal(slotEditorKind('code'), 'code');
    assert.equal(slotEditorKind('cards'), 'cards');
  });
});
