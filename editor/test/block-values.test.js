import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import { addTab, embedHeight, embedUrlProblem, moveTab, removeTab, setTab, tabsArray } from '../js/block-values.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('tabs (I-036)', () => {
  const tabs = [{ label: 'JS', md: 'a' }, { label: 'Python', md: 'b' }];

  test('add, move, remove, but never the last tab', () => {
    assert.deepEqual(addTab(tabs).at(-1), { label: 'Tab 3', md: '' });
    assert.deepEqual(moveTab(tabs, 0, 1).map((t) => t.label), ['Python', 'JS']);
    assert.deepEqual(removeTab(tabs, 0).map((t) => t.label), ['Python']);
    assert.deepEqual(removeTab([tabs[0]], 0), [tabs[0]], 'a tabs block keeps one tab');
    assert.deepEqual(tabsArray('x'), []);
  });

  test('setTab ignores an empty label but takes empty text', () => {
    assert.equal(setTab(tabs, 0, { label: '  ' })[0].label, 'JS');
    assert.equal(setTab(tabs, 0, { label: 'TypeScript' })[0].label, 'TypeScript');
    assert.equal(setTab(tabs, 1, { md: '' })[1].md, '');
    assert.equal(tabs[0].label, 'JS', 'immutable');
  });
});

describe('embed (I-036)', () => {
  test('URL problems', () => {
    assert.equal(embedUrlProblem('https://example.com'), null);
    assert.equal(embedUrlProblem('pages/demo.html'), null);
    assert.equal(embedUrlProblem('').level, 'error');
    assert.equal(embedUrlProblem('javascript:alert(1)').level, 'error');
    assert.equal(embedUrlProblem('http://example.com').level, 'warning');
    assert.equal(embedUrlProblem('ftp://example.com').level, 'warning');
  });

  test('height: integer of at least 100, or the default', () => {
    assert.equal(embedHeight('480'), 480);
    assert.equal(embedHeight('50'), 100);
    assert.equal(embedHeight(''), undefined);
    assert.equal(embedHeight('tall'), undefined);
  });
});

test('edited tabs, embed and slide-ref blocks keep the demo valid', () => {
  const slide = demo.slides[0];
  let show = actions.addBlock(demo, { slideId: slide.id, block: { type: 'tabs', tabs: addTab([]) } });
  const tabsId = show.slides[0].reader.blocks.at(-1).id;
  show = actions.updateBlock(show, { slideId: slide.id, blockId: tabsId, patch: { tabs: setTab(addTab(show.slides[0].reader.blocks.at(-1).tabs), 1, { md: 'Hello' }) } });
  show = actions.addBlock(show, { slideId: slide.id, block: { type: 'embed', url: 'https://example.com', title: 'Example', height: embedHeight('300') } });
  show = actions.addBlock(show, { slideId: slide.id, block: { type: 'slide-ref', slide: demo.slides[2].id, label: 'See also' } });
  assert.deepEqual(validateShow(show, { template }).errors, []);
  assert.deepEqual(validateShow(show, { template }).warnings, []);
});

test('toggleAllow keeps display order and drops an empty list (I-071)', async () => {
  const { toggleAllow } = await import('../js/block-values.js');
  assert.deepEqual(toggleAllow(undefined, 'modals', true), ['modals']);
  assert.deepEqual(toggleAllow(['modals'], 'same-origin', true), ['same-origin', 'modals']);
  assert.equal(toggleAllow(['modals'], 'modals', false), undefined);
});

test('webValue always has url and a title (I-071)', async () => {
  const { webValue } = await import('../js/block-values.js');
  assert.deepEqual(webValue(undefined, { url: 'https://x.example' }), { url: 'https://x.example', title: 'Web page' });
  const v = webValue({ url: 'https://x.example', title: 'X', present: 'static' }, { title: '  ', present: undefined, load: 'auto' });
  assert.deepEqual(v, { url: 'https://x.example', title: 'X', load: 'auto' });
});
