import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchSlides, navigateIndex } from '../js/slide-filter.js';

const entries = [
  { number: 1, title: 'Fundament voor autonomie', layout: 'title-image', chapter: 'Default Section' },
  { number: 2, title: 'AI Act', layout: 'text', chapter: 'background' },
  { number: 3, title: 'Waarom willen we agents?', layout: 'text' },
  { number: 12, title: 'Café ideeën', layout: 'columns-4' },
];

describe('slide navigator: go to slide', () => {
  test('a number matches exactly that slide', () => {
    assert.deepEqual(matchSlides(entries, '12'), [12]);
    assert.deepEqual(matchSlides(entries, ' 2 '), [2]);
    assert.deepEqual(matchSlides(entries, '99'), []);
  });

  test('words match title, layout or chapter, case- and accent-insensitive', () => {
    assert.deepEqual(matchSlides(entries, 'ai act'), [2]);
    assert.deepEqual(matchSlides(entries, 'cafe'), [12]);
    assert.deepEqual(matchSlides(entries, 'text'), [2, 3]);
    assert.deepEqual(matchSlides(entries, 'background'), [2]);
    assert.deepEqual(matchSlides(entries, 'agents waarom'), [3]);
  });

  test('an empty query shows every slide', () => {
    assert.deepEqual(matchSlides(entries, '  '), [1, 2, 3, 12]);
  });
});

describe('slide navigator: keys', () => {
  test('arrows, pages and ends stay within the list', () => {
    assert.equal(navigateIndex('ArrowDown', 0, 26), 1);
    assert.equal(navigateIndex('ArrowUp', 0, 26), 0);
    assert.equal(navigateIndex('PageDown', 10, 26), 15);
    assert.equal(navigateIndex('PageDown', 24, 26), 25);
    assert.equal(navigateIndex('PageUp', 3, 26), 0);
    assert.equal(navigateIndex('Home', 12, 26), 0);
    assert.equal(navigateIndex('End', 0, 26), 25);
  });

  test('other keys and empty lists do nothing', () => {
    assert.equal(navigateIndex('a', 3, 26), null);
    assert.equal(navigateIndex('ArrowDown', 0, 0), null);
  });
});
