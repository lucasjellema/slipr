import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import { layoutChangeEffects, layoutName, sampleContent, slideInLayout } from '../js/layout-choice.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const conclusion = readJson('templates/conclusion/template.json');
const def = (t, id) => t.layouts.find((l) => l.id === id);

describe('layout picker logic (E-004)', () => {
  test('layout names', () => {
    assert.equal(layoutName(def(template, 'bullets')), 'Title and bullets');
    assert.equal(layoutName({ id: 'x' }), 'x');
  });

  test('switching bullets → section hides the body, and switching back restores it', () => {
    const slide = demo.slides.find((s) => s.layout === 'bullets' && s.content.body);
    const bodyLabel = def(template, 'bullets').slots.find((s) => s.name === 'body').label ?? 'body';
    const asSection = slideInLayout(slide, 'section', template.layouts);
    const effects = layoutChangeEffects(slide, asSection, template.layouts);
    assert.deepEqual(effects.hidden, [bodyLabel]);
    assert.deepEqual(effects.needed, []);
    const back = slideInLayout(asSection, 'bullets', template.layouts);
    assert.deepEqual(layoutChangeEffects(asSection, back, template.layouts).restored, [bodyLabel]);
    assert.deepEqual(back.content, slide.content);
    assert.equal(slide.layout, 'bullets', 'the input slide is not changed');
  });

  test('required slots that stay empty are reported', () => {
    const slide = demo.slides.find((s) => s.layout === 'bullets');
    const asImage = slideInLayout(slide, 'image-full', template.layouts);
    const needed = layoutChangeEffects(slide, asImage, template.layouts).needed;
    assert.ok(needed.length >= 1);
  });

  for (const [name, t] of [['default', template], ['conclusion', conclusion]]) {
    test(`sample content fits every ${name} layout without errors`, () => {
      for (const layout of t.layouts) {
        const show = {
          slipr: '0.1', id: 'sample', meta: { title: 'Sample' }, template: { ref: `/templates/${t.id}` },
          slides: [{ id: 's-1', layout: layout.id, content: sampleContent(layout) }],
        };
        assert.deepEqual(validateShow(show, { template: t }).errors, [], layout.id);
      }
    });
  }
});
