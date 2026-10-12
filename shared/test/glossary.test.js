import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { foldText, glossaryPhrases, findTerms } from '../glossary.js';

const glossary = {
  layout: { term: 'layout', definition: 'x' },
  'layout-picker': { term: 'layout picker', definition: 'x' },
  ai: { term: 'artificial intelligence', aliases: ['AI', 'A.I.'], definition: 'x' },
  cafe: { term: 'café', definition: 'x' },
  reveal: { term: 'Reveal.js', definition: 'x' },
};
const phrases = glossaryPhrases(glossary);
/** The linked words of a text, as "id:text". */
const found = (text, seen = new Set()) => findTerms(text, phrases, seen).map((m) => `${m.id}:${text.slice(m.start, m.end)}`);

describe('glossary terms in text (I-086)', () => {
  test('whole words only, case-insensitive', () => {
    assert.deepEqual(found('Pick a Layout here'), ['layout:Layout']);
    assert.deepEqual(found('layouts and relayout'), [], 'not inside longer words');
    assert.deepEqual(found('(layout).'), ['layout:layout'], 'punctuation is a boundary');
  });

  test('accents and white space are folded, the original text is kept', () => {
    assert.deepEqual(found('Meet at the CAFE'), ['cafe:CAFE']);
    assert.deepEqual(found('The café opens'), ['cafe:café']);
    assert.deepEqual(found('the layout\n   picker'), ['layout-picker:layout\n   picker']);
  });

  test('the longest phrase wins and consumes its text', () => {
    assert.deepEqual(found('Open the layout picker'), ['layout-picker:layout picker']);
    assert.deepEqual(found('A layout and a layout picker'), ['layout:layout', 'layout-picker:layout picker']);
    const seen = new Set(['layout-picker']);
    assert.deepEqual(found('the layout picker again', seen), [], 'an already linked longer term is not split into a shorter one');
  });

  test('aliases match like the term; each term once', () => {
    assert.deepEqual(found('AI, or artificial intelligence, or AI again'), ['ai:AI']);
    assert.deepEqual(found('What A.I. means'), ['ai:A.I.']);
    assert.deepEqual(found('Uses Reveal.js underneath'), ['reveal:Reveal.js']);
  });

  test('first occurrence per slide: the seen set carries across texts', () => {
    const seen = new Set();
    assert.deepEqual(found('A layout', seen), ['layout:layout']);
    assert.deepEqual(found('Another layout', seen), []);
  });

  test('phrases: longest first, duplicates and unusable names dropped', () => {
    const p = glossaryPhrases({ a: { term: 'API', aliases: ['api', ' ', '--'] }, b: { term: 'API' }, c: { term: 'web API' } });
    assert.deepEqual(p.map((x) => `${x.id}:${x.phrase}`), ['c:web api', 'a:api']);
    assert.deepEqual(found('Not AI-driven but A.I.-driven'), ['ai:AI'], 'a hyphen is a boundary; the alias with dots also matches later only once');
    assert.deepEqual(glossaryPhrases(undefined), []);
  });

  test('foldText maps folded characters back to the original', () => {
    const { folded, map } = foldText('Ça  va');
    assert.equal(folded, 'ca va');
    assert.deepEqual(map, [0, 1, 2, 4, 5, 6]);
  });
});
