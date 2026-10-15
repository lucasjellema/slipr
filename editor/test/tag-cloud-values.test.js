import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addStep, addTerm, highlightFromText, highlightText, inlineFromFile, moveStep, moveTerm, newTagCloud, pastedTerms,
  removeStep, removeTerm, setStep, setTerm, tagCloudFromPaste, tagCloudSummary, tagCloudValue, useDataFile, weightFromText,
} from '../js/tag-cloud-values.js';
import { convertBlock, setBlockType, setSlot } from '../js/actions.js';
import { slotEditorKind } from '../js/slot-values.js';
import { withFallback } from '../js/block-values.js';

const CLOUD = { terms: [{ text: 'A', weight: 3 }, { text: 'B' }], steps: [{ terms: 1 }] };

describe('tag cloud values (I-105)', () => {
  test('tagCloudValue drops empty fields but keeps an empty term list', () => {
    assert.deepEqual(tagCloudValue(CLOUD, { caption: '', steps: [], order: undefined }), { terms: CLOUD.terms });
    assert.deepEqual(tagCloudValue({}, { terms: [] }), { terms: [] });
    assert.deepEqual(CLOUD.steps, [{ terms: 1 }], 'immutable');
  });

  test('terms: set, add, remove, move', () => {
    assert.deepEqual(setTerm(CLOUD, 1, { weight: 2, glossary: 'x' }).terms[1], { text: 'B', weight: 2, glossary: 'x' });
    assert.deepEqual(setTerm(CLOUD, 0, { weight: undefined }).terms[0], { text: 'A' });
    assert.deepEqual(setTerm(CLOUD, 0, { text: '' }).terms[0], { text: '', weight: 3 }, 'an empty text stays while typing');
    assert.deepEqual(addTerm(CLOUD).terms.map((t) => t.text), ['A', 'B', '']);
    assert.deepEqual(addTerm(CLOUD, 0).terms.map((t) => t.text), ['A', '', 'B']);
    assert.deepEqual(removeTerm(CLOUD, 0).terms, [{ text: 'B' }]);
    assert.deepEqual(moveTerm(CLOUD, 0, 1).terms.map((t) => t.text), ['B', 'A']);
    assert.equal(moveTerm(CLOUD, 0, 5), CLOUD);
    assert.deepEqual(CLOUD.terms[0], { text: 'A', weight: 3 }, 'immutable');
  });

  test('weights from typed text', () => {
    assert.equal(weightFromText(''), undefined);
    assert.equal(weightFromText('2,5'), 2.5);
    assert.equal(weightFromText('-1'), undefined);
    assert.equal(weightFromText('x'), undefined);
  });

  test('pasted lists: a term per line, with an optional weight after a tab, comma or semicolon', () => {
    assert.deepEqual(pastedTerms('Onboarding, 12\nTraining\t8\n"Talks; demos";3,5\n\nPlain words, here\n'), [
      { text: 'Onboarding', weight: 12 },
      { text: 'Training', weight: 8 },
      { text: 'Talks; demos', weight: 3.5 },
      { text: 'Plain words, here' },
    ]);
    const pasted = tagCloudFromPaste({ data: 'data/a.csv', termColumn: 'x', caption: 'c' }, 'One\nTwo, 2');
    assert.deepEqual(pasted, { caption: 'c', terms: [{ text: 'One' }, { text: 'Two', weight: 2 }] });
    assert.equal(tagCloudFromPaste(CLOUD, '  \n'), CLOUD);
  });

  test('a CSV file: use it, or move its terms into the slide (merged, heaviest first)', () => {
    assert.deepEqual(useDataFile(CLOUD, 'data/k.csv'), { data: 'data/k.csv', steps: [{ terms: 1 }] });
    const rows = [['answer'], ['Talks'], ['Docs'], ['talks']];
    assert.deepEqual(inlineFromFile({ data: 'data/k.csv', weightLabel: 'answers' }, rows), {
      weightLabel: 'answers', terms: [{ text: 'Talks', weight: 2 }, { text: 'Docs', weight: 1 }],
    });
  });

  test('steps: add, set, remove, move; highlights as typed text', () => {
    let v = addStep(CLOUD, { highlight: 'A' });
    assert.deepEqual(v.steps, [{ terms: 1 }, { highlight: 'A' }]);
    v = setStep(v, 0, { terms: 'all' });
    assert.deepEqual(moveStep(v, 1, 0).steps, [{ highlight: 'A' }, { terms: 'all' }]);
    assert.equal(removeStep(removeStep(v, 0), 0).steps, undefined);
    assert.deepEqual(highlightFromText('A, B ,'), ['A', 'B']);
    assert.equal(highlightFromText(' A '), 'A');
    assert.equal(highlightFromText(' '), null);
    assert.equal(highlightText(['A', 'B']), 'A, B');
    assert.equal(highlightText(null), '');
  });

  test('summary and a new cloud', () => {
    assert.equal(tagCloudSummary(CLOUD), 'Tag cloud: 2 terms');
    assert.equal(tagCloudSummary({ data: 'data/k.csv' }), 'Tag cloud from data/k.csv');
    assert.equal(newTagCloud().terms.length, 3);
  });

  test('the slide form edits tag-cloud slots; a fallback keeps the shape', () => {
    assert.equal(slotEditorKind('tag-cloud', CLOUD), 'tag-cloud');
    assert.deepEqual(withFallback(CLOUD, { src: 'a.png', alt: '' }), { ...CLOUD, fallback: { src: 'a.png', alt: '' } });
  });

  test('a block switched to Tag cloud gets three terms, or keeps a CSV file; format 0.2 follows', () => {
    const block = convertBlock({ id: 'b', type: 'text', md: 'x' }, 'tag-cloud');
    assert.equal(block.type, 'tag-cloud');
    assert.equal(block.terms.length, 3);
    assert.deepEqual(convertBlock({ id: 'b', type: 'table', title: 'T', data: 'data/k.csv', columns: [] }, 'tag-cloud'), { id: 'b', type: 'tag-cloud', title: 'T', data: 'data/k.csv' });
    const show = { slipr: '0.1', slides: [{ id: 's', layout: 'x', content: {}, reader: { blocks: [{ id: 'b', type: 'text', md: '' }] } }] };
    assert.equal(setBlockType(show, { slideId: 's', blockId: 'b', type: 'tag-cloud' }).slipr, '0.2');
    assert.equal(setSlot(show, { slideId: 's', slot: 'cloud', value: CLOUD }).slipr, '0.2');
  });
});
