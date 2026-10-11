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

describe('slide list: drag and drop (E-003)', async () => {
  const { dropIndex } = await import('../js/slide-filter.js');
  const { readJson } = await import('../../shared/test/helpers.js');
  const actions = await import('../js/actions.js');
  const demo = readJson('shows/demo/show.json');
  const ids = (show) => show.slides.map((s) => s.id);

  /** Drop slide `from` before/after slide `target` and return the new order. */
  const drop = (from, target, after) => ids(actions.moveSlide(demo, { slideId: demo.slides[from].id, toIndex: dropIndex(from, target, after) }));

  test('dropping down the list lands exactly before / after the target', () => {
    const order = drop(1, 4, false);
    assert.equal(order.indexOf(demo.slides[1].id), order.indexOf(demo.slides[4].id) - 1);
    const order2 = drop(1, 4, true);
    assert.equal(order2.indexOf(demo.slides[1].id), order2.indexOf(demo.slides[4].id) + 1);
  });

  test('dropping up the list lands exactly before / after the target', () => {
    const order = drop(6, 2, false);
    assert.equal(order.indexOf(demo.slides[6].id), order.indexOf(demo.slides[2].id) - 1);
    const order2 = drop(6, 2, true);
    assert.equal(order2.indexOf(demo.slides[6].id), order2.indexOf(demo.slides[2].id) + 1);
  });

  test('dropping onto its own place or a neighbouring gap changes nothing', () => {
    assert.deepEqual(drop(3, 3, false), ids(demo));
    assert.deepEqual(drop(3, 3, true), ids(demo));
    assert.deepEqual(drop(3, 2, true), ids(demo));
    assert.deepEqual(drop(3, 4, false), ids(demo));
  });

  test('to the very start and the very end', () => {
    assert.equal(drop(5, 0, false)[0], demo.slides[5].id);
    assert.equal(drop(0, demo.slides.length - 1, true).at(-1), demo.slides[0].id);
  });
});
