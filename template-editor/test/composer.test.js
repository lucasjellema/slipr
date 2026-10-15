import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { repoRoot } from '../../shared/test/helpers.js';
import { openTemplate, outputFiles, changedPaths, deletedPaths, markSaved, sheetTexts } from '../js/actions.js';
import {
  looksOf, composedOf, layoutDef, setLayoutMeta, setSlotProp, addLayout, removeLayout, addSlotBox, setBoxLook,
  renameSlot, addImageFile, addPictureBox, setBox, removeBox, moveBoxInOrder, setLayoutBackground, setLayoutClass,
  layoutIdProblem,
} from '../js/layout-actions.js';
import { parseElements, allElements, withAttributes } from '../js/composer/html-elements.js';
import { findBlock, readLayoutBlock, clampArea, setBlock } from '../js/composer/composer-css.js';
import { looksFor, rootClasses, isComposedHtml, SLOT_TYPES, lookKeyOf, freeName } from '../js/composer/layout-model.js';
import { isTextFile } from '../js/template-files.js';
import { generatedSample } from '../js/sample-show.js';
import { validateTemplate, validateShow } from '../../shared/validate.js';

/** Every file of a template folder, text as strings and the rest as Blobs. */
function readTemplate(id) {
  const root = resolve(repoRoot, 'templates', id);
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(root, full).replaceAll('\\', '/');
        files.set(path, isTextFile(path) ? readFileSync(full, 'utf8') : new Blob([readFileSync(full)]));
      }
    }
  };
  walk(root);
  return files;
}

const parsedTemplate = (state) => JSON.parse(outputFiles(state).get('template.json'));

describe('layout fragments (I-111)', () => {
  test('elements, nesting and attributes of a layout with a card blueprint', () => {
    const html = readFileSync(resolve(repoRoot, 'templates/conclusion/layouts/columns-4.html'), 'utf8');
    const [root] = parseElements(html);
    assert.equal(root.tag, 'div');
    assert.ok(root.attrs.get('class').includes('cnc'));
    const cards = allElements([root]).find((e) => e.attrs.get('data-slot') === 'cards');
    assert.ok(html.slice(cards.start, cards.end).includes('<template>'));
    assert.ok(html.slice(cards.start, cards.end).endsWith('</div>'));
    const img = root.children.find((e) => e.tag === 'img');
    assert.equal(img.end, img.openEnd, 'void element');
  });

  test('withAttributes sets, replaces and removes attributes on the opening tag only', () => {
    assert.equal(withAttributes('<h2 class="a" data-slot="x"></h2>', { 'data-slot': 'title', 'data-box': 'title' }), '<h2 class="a" data-slot="title" data-box="title"></h2>');
    assert.equal(withAttributes('<img class="a" src="b.svg" alt="">', { alt: null }), '<img class="a" src="b.svg">');
    assert.equal(withAttributes('<p hidden>x "y"</p>', { title: 'a "b"' }), '<p hidden="" title="a &quot;b&quot;">x "y"</p>');
  });
});

describe('composer blocks in theme.css (I-111)', () => {
  test('set, replace and remove a block; everything else stays', () => {
    const css = ':root { --a: 1; }\n.x { color: red; }\n';
    const one = setBlock(css, 'base', '.slipr-composed { display: grid; }');
    assert.ok(one.startsWith(css.trimEnd()));
    assert.ok(findBlock(one, 'base'));
    assert.equal(findBlock(one, 'bas'), null, 'ids are matched whole');
    const two = setBlock(setBlock(one, 'quote', '.q { }'), 'base', '.slipr-composed { display: flex; }');
    assert.ok(two.includes('display: flex') && !two.includes('display: grid'));
    assert.ok(two.indexOf('begin base') < two.indexOf('begin quote'), 'replaced in place');
    assert.equal(setBlock(setBlock(two, 'quote', null), 'base', null), css);
  });

  test('areas are read back from the block, also after a hand edit', () => {
    let state = addLayout(openTemplate(readTemplate('default')), { id: 'quote-photo', name: 'Quote with photo' });
    state = setBox(state, 'quote-photo', 'title', { area: { x: 7, y: 8, w: 63, h: 10 } });
    const theme = sheetTexts(state).theme;
    assert.ok(theme.includes('.slipr-composed--quote-photo > [data-box="title"] { grid-area: 9 / 8 / 19 / 71; }'));
    const edited = theme.replace('grid-area: 9 / 8 / 19 / 71', 'grid-area: 2 / 3 / 12 / 50');
    assert.deepEqual(readLayoutBlock(edited, 'quote-photo').boxes.get('title').area, { x: 2, y: 1, w: 47, h: 10 });
  });

  test('areas stay inside the slide, in whole percent', () => {
    assert.deepEqual(clampArea({ x: -5, y: 98.6, w: 300, h: 0 }), { x: 0, y: 99, w: 100, h: 1 });
    assert.deepEqual(clampArea({ x: 12.4, y: 3.5, w: 20.2, h: NaN }), { x: 12, y: 4, w: 20, h: 10 });
  });
});

describe('looks (I-111)', () => {
  test('default: the title look is the template\'s own heading; types without a look get a plain one', () => {
    const state = openTemplate(readTemplate('default'));
    const looks = looksOf(state);
    assert.equal(looksOf(state), looks, 'cached');
    assert.match(looksFor(looks, 'text', 'title')[0].markup, /^<h2 class="slipr-title"><\/h2>$/);
    assert.match(looksFor(looks, 'image')[0].markup, /^<img class="slipr-image"/);
    assert.equal(looksFor(looks, 'quote')[0].key, 'quote|fallback');
    assert.ok(looksFor(looks, 'cards')[0].fields.length > 0, 'a plain cards look has fields');
  });

  test('Conclusion: card looks carry their blueprint and fields; root classes', () => {
    const state = openTemplate(readTemplate('conclusion'));
    const cards = looksFor(looksOf(state), 'cards');
    assert.ok(cards.length >= 3);
    for (const look of cards) {
      assert.ok(look.markup.includes('<template>'), look.label);
      assert.ok(look.fields.length > 0, look.label);
    }
    assert.match(looksFor(looksOf(state), 'text', 'title')[0].markup, /class="cnc-title"/);
    const { shared, variants } = rootClasses(state.template, (p) => state.files.get(p));
    assert.deepEqual(shared, ['cnc']);
    assert.ok(variants.includes('cnc-dark'));
  });
});

describe('composed layouts (I-111)', () => {
  test('a new layout: file, blocks and template.json; it validates and round-trips', () => {
    const before = openTemplate(readTemplate('default'));
    const theme = sheetTexts(before).theme;
    const state = addLayout(before, { id: 'quote-photo', name: 'Quote with photo', description: 'A quote next to a photo.' });
    const html = state.files.get('layouts/quote-photo.html');
    assert.ok(isComposedHtml(html));
    assert.ok(html.includes('data-slot="title" data-box="title"'));
    assert.ok(sheetTexts(state).theme.startsWith(theme.trimEnd()), 'the rest of theme.css is untouched');
    assert.ok(findBlock(sheetTexts(state).theme, 'base') && findBlock(sheetTexts(state).theme, 'quote-photo'));
    const template = parsedTemplate(state);
    assert.deepEqual(template.layouts.at(-1), {
      id: 'quote-photo', name: 'Quote with photo', description: 'A quote next to a photo.', file: 'layouts/quote-photo.html',
      slots: [{ name: 'title', type: 'text', label: 'Title', required: true, maxLength: 70 }],
    });
    assert.equal(validateTemplate(template).ok, true);
    assert.deepEqual(changedPaths(state).sort(), ['layouts/quote-photo.html', 'template.json', 'theme.css']);
    const model = composedOf(state, 'quote-photo');
    assert.deepEqual(model.classes, []);
    assert.equal(model.boxes.length, 1);
    assert.deepEqual(model.boxes[0].area, { x: 7, y: 6, w: 72, h: 11 });
    assert.equal(composedOf(state, 'bullets'), null, 'hand-written');
    assert.equal(layoutIdProblem(state, 'quote-photo'), 'The template already has a layout "quote-photo".');
    assert.ok(layoutIdProblem(state, 'base'));
    assert.ok(layoutIdProblem(state, 'two words'));
  });

  test('every slot type can be added; the generated sample validates against the template', () => {
    let state = addLayout(openTemplate(readTemplate('default')), { id: 'everything', name: 'Everything' });
    for (const [type] of SLOT_TYPES) state = addSlotBox(state, 'everything', { type, name: freeName(type, layoutDef(state, 'everything').slots.map((s) => s.name)) });
    const model = composedOf(state, 'everything');
    assert.equal(model.boxes.length, SLOT_TYPES.length + 1);
    const graph = model.boxes.find((b) => b.slot === 'graph');
    assert.match(graph.markup, /^<figure class="slipr-composed-figure slipr-composed-figure--graph"><div class="slipr-graph" data-slot="graph"><\/div><\/figure>$/);
    const template = parsedTemplate(state);
    assert.equal(validateTemplate(template).ok, true);
    const result = validateShow(generatedSample(template), { template });
    assert.deepEqual(result.errors, []);
    assert.throws(() => addSlotBox(state, 'everything', { type: 'text', name: 'title' }), /already has/);
    assert.throws(() => addSlotBox(state, 'everything', { type: 'chart', name: 'c' }), /Unknown slot type/);
  });

  test('boxes: move, resize, fit, order, rename, look, remove', () => {
    let state = addLayout(openTemplate(readTemplate('conclusion')), { id: 'agenda-2', name: 'Agenda 2' });
    state = addSlotBox(state, 'agenda-2', { type: 'richtext', name: 'body' });
    state = addSlotBox(state, 'agenda-2', { type: 'cards', name: 'steps' });
    state = setBox(state, 'agenda-2', 'body', { area: { x: 7, y: 20, w: 40, h: 60 } });
    assert.deepEqual(composedOf(state, 'agenda-2').boxes.find((b) => b.id === 'body').area, { x: 7, y: 20, w: 40, h: 60 });
    assert.equal(setBox(state, 'agenda-2', 'body', { area: { x: 7, y: 20, w: 40, h: 60 } }), state, 'no change, same state');

    state = moveBoxInOrder(state, 'agenda-2', 'steps', -1);
    assert.deepEqual(composedOf(state, 'agenda-2').boxes.map((b) => b.id), ['title', 'steps', 'body']);
    assert.deepEqual(layoutDef(state, 'agenda-2').slots.map((s) => s.name), ['title', 'steps', 'body'], 'slots follow');

    state = renameSlot(state, 'agenda-2', 'body', 'text');
    assert.ok(state.files.get('layouts/agenda-2.html').includes('data-slot="text" data-box="text"'));
    assert.deepEqual(composedOf(state, 'agenda-2').boxes.find((b) => b.id === 'text').area, { x: 7, y: 20, w: 40, h: 60 }, 'the area follows the name');

    const cardLooks = looksFor(looksOf(state), 'cards');
    const other = cardLooks.find((l) => l.key !== lookKeyOf(cardLooks, composedOf(state, 'agenda-2').boxes.find((b) => b.id === 'steps').markup, 'cards'));
    state = setBoxLook(state, 'agenda-2', 'steps', other.key);
    assert.deepEqual(layoutDef(state, 'agenda-2').slots.find((s) => s.name === 'steps').fields, other.fields);
    assert.equal(lookKeyOf(looksOf(state), composedOf(state, 'agenda-2').boxes.find((b) => b.id === 'steps').markup, 'cards'), other.key);

    state = removeBox(state, 'agenda-2', 'steps');
    assert.deepEqual(layoutDef(state, 'agenda-2').slots.map((s) => s.name), ['title', 'text']);
    assert.equal(validateTemplate(parsedTemplate(state)).ok, true);
  });

  test('pictures, background and variant classes', () => {
    let state = addLayout(openTemplate(readTemplate('conclusion')), { id: 'photo-quote', name: 'Photo quote' });
    assert.deepEqual(composedOf(state, 'photo-quote').classes, ['cnc', 'cnc-dark'], 'shared root classes and the usual variant');
    state = setLayoutClass(state, 'photo-quote', 'cnc-dark', false);
    const added = addImageFile(state, 'My Wave.SVG', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.equal(added.path, 'assets/decor/my-wave.svg');
    state = addPictureBox(added.state, 'photo-quote', added.path);
    state = addPictureBox(state, 'photo-quote', 'assets/logos/conclusion-logo.png');
    state = setBox(state, 'photo-quote', 'picture-1', { fit: 'cover', area: { x: 0, y: 0, w: 100, h: 100 } });
    state = setLayoutBackground(state, 'photo-quote', '--cnc-magenta');
    state = setLayoutClass(state, 'photo-quote', 'cnc-dark', true);
    const html = state.files.get('layouts/photo-quote.html');
    assert.ok(html.includes('<img class="slipr-composed-picture" src="../assets/decor/my-wave.svg" alt="" data-box="picture-1">'));
    assert.ok(html.includes('class="slipr-layout slipr-composed slipr-composed--photo-quote cnc cnc-dark"'));
    const block = readLayoutBlock(sheetTexts(state).theme, 'photo-quote');
    assert.equal(block.background, '--cnc-magenta');
    assert.deepEqual(block.boxes.get('picture-1'), { area: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover' });
    assert.equal(block.boxes.get('picture-2').fit, 'contain');
    assert.throws(() => setBox(state, 'photo-quote', 'picture-1', { fit: 'url(x)' }));
    assert.throws(() => setLayoutBackground(state, 'photo-quote', 'red; color: x'));
    assert.throws(() => addPictureBox(state, 'photo-quote', 'assets/none.png'));
  });

  test('a copy of a hand-written layout: its slots and logo, arranged', () => {
    const base = openTemplate(readTemplate('conclusion'));
    const state = addLayout(base, { id: 'text-image-2', name: 'Text and photo (composed)', from: 'text-image' });
    const source = layoutDef(base, 'text-image');
    assert.deepEqual(layoutDef(state, 'text-image-2').slots, source.slots);
    const model = composedOf(state, 'text-image-2');
    assert.deepEqual(model.boxes.map((b) => b.id), [...source.slots.map((s) => s.name), 'picture-1']);
    assert.match(model.boxes.find((b) => b.id === 'title').markup, /class="cnc-title"/);
    assert.match(model.boxes.at(-1).markup, /conclusion-logo\.png/);
    assert.deepEqual(model.classes, ['cnc', 'cnc-dark'], 'the root classes, without the modifier');
    for (const box of model.boxes) assert.ok(box.area.x + box.area.w <= 100 && box.area.y + box.area.h <= 100);
    // A copy of a composed layout keeps its areas.
    const again = addLayout(state, { id: 'text-image-3', name: 'Again', from: 'text-image-2' });
    assert.deepEqual(composedOf(again, 'text-image-3').boxes.map((b) => b.area), model.boxes.map((b) => b.area));
    assert.equal(validateTemplate(parsedTemplate(again)).ok, true);
  });

  test('a copy of two columns: each column title sits on top of its text', () => {
    const state = addLayout(openTemplate(readTemplate('default')), { id: 'two-up', name: 'Two up', from: 'two-column' });
    const areas = Object.fromEntries(composedOf(state, 'two-up').boxes.map((b) => [b.id, b.area]));
    assert.equal(areas.leftTitle.x, areas.left.x);
    assert.equal(areas.leftTitle.y + areas.leftTitle.h + 1, areas.left.y);
    assert.equal(areas.rightTitle.x, areas.right.x);
    assert.ok(areas.right.x > areas.left.x + areas.left.w, 'side by side');
  });

  test('removing: the block, the base block with the last one, and the file on save', () => {
    const opened = openTemplate(readTemplate('default'));
    const theme = sheetTexts(opened).theme;
    let state = addLayout(addLayout(opened, { id: 'a', name: 'A' }), { id: 'b', name: 'B' });
    state = markSaved(state, outputFiles(state));
    state = removeLayout(state, 'a');
    assert.ok(findBlock(sheetTexts(state).theme, 'base'), 'b still needs the base');
    assert.deepEqual(deletedPaths(state), ['layouts/a.html']);
    assert.ok(changedPaths(state).includes('layouts/a.html'));
    state = removeLayout(state, 'b');
    assert.equal(sheetTexts(state).theme, theme, 'theme.css is back as it was');
    assert.throws(() => removeLayout(state, 'bullets'), /Only layouts made with the composer/);
  });
});

describe('slot settings on any layout (I-111)', () => {
  test('a hand-written layout: settings change, template.json keeps its formatting', () => {
    const state = openTemplate(readTemplate('default'));
    let next = setSlotProp(state, 'bullets', 'body', 'maxItems', 6);
    next = setSlotProp(next, 'bullets', 'body', 'help', 'One idea per bullet.');
    next = setSlotProp(next, 'bullets', 'title', 'required', false);
    next = setLayoutMeta(next, 'bullets', 'name', 'Bullets');
    const slots = layoutDef(next, 'bullets').slots;
    assert.equal(slots[1].maxItems, 6);
    assert.equal(slots[1].help, 'One idea per bullet.');
    assert.equal('required' in slots[0], false);
    const before = state.saved.get('template.json');
    const after = outputFiles(next).get('template.json');
    assert.equal(after.split('\n').length, before.split('\n').length, 'same lines: one-line slots stay one line');
    assert.deepEqual(changedPaths(next), ['template.json']);
    assert.throws(() => setSlotProp(state, 'bullets', 'body', 'maxItems', 0));
    assert.throws(() => setSlotProp(state, 'bullets', 'body', 'name', 'x'));
    assert.equal(setSlotProp(state, 'bullets', 'body', 'help', ''), state, 'removing what is not there');
  });
});
