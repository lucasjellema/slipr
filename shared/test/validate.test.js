import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateShow, validateTemplate, collectImagePaths, satisfies } from '../validate.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJson, exists, clone, codes, repoRoot } from './helpers.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

/** Validate a mutated copy of the demo show. */
function validateVariant(mutate) {
  const show = clone(demo);
  mutate(show);
  return validateShow(show, { template });
}

/** Remove every show-format 0.2 feature (overlays, picture style / opacity / crop, glossary aliases, embeds, graphs). */
function withoutFormat02(s) {
  s.slides = s.slides.filter((x) => x.layout !== 'web' && x.layout !== 'pdf' && x.layout !== 'graph' && x.layout !== 'map');
  for (const slide of s.slides) if (slide.reader?.blocks) slide.reader.blocks = slide.reader.blocks.filter((b) => b.type !== 'graph' && b.type !== 'map');
  for (const slide of s.slides) delete slide.overlays;
  for (const block of s.slides.flatMap((x) => x.reader?.blocks ?? [])) if (block.image) { delete block.image.style; delete block.image.opacity; }
  for (const entry of Object.values(s.glossary ?? {})) delete entry.aliases;
  for (const slide of s.slides) for (const value of Object.values(slide.content ?? {})) if (value && typeof value === 'object') delete value.crop;
  for (const block of s.slides.flatMap((x) => x.reader?.blocks ?? [])) if (block.image) delete block.image.crop;
  for (const slide of s.slides) for (const value of Object.values(slide.content ?? {})) if (value && typeof value === 'object') delete value.fallback;
  for (const block of s.slides.flatMap((x) => x.reader?.blocks ?? [])) { delete block.fallback; delete block.load; }
}

describe('valid inputs', () => {
  test('the default template is valid', () => {
    const result = validateTemplate(template);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('the demo show is valid, without warnings, and all images exist', () => {
    const result = validateShow(demo, {
      template,
      imageExists: (src) => exists(`shows/demo/${src}`),
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.ok, true);
  });

  test('every layout file referenced by the template exists and contains no <section>', () => {
    for (const layout of template.layouts) {
      assert.ok(exists(`templates/default/${layout.file}`), layout.file);
      const html = readFileSync(resolve(repoRoot, 'templates/default', layout.file), 'utf8');
      assert.doesNotMatch(html, /<section\b/i, `${layout.file}: Reveal.js would treat <section> as a vertical slide`);
    }
    assert.ok(exists('templates/default/theme.css'));
    assert.ok(exists('templates/default/reader.css'));
  });
});

describe('template format 0.2', () => {
  test('placeholder roles in pptxMapping are accepted and checked', () => {
    const t = clone(template);
    t.slipr = '0.3'; // 0.3 includes 0.2's placeholder roles
    t.pptxIgnore = [15, 16, 85];
    t.pptxMapping['Text'] = { layout: 'bullets', placeholders: { 0: 'title', 13: 'body', 35: null } };
    assert.deepEqual(validateTemplate(t), { ok: true, errors: [], warnings: [] });

    t.pptxMapping['Bad'] = { layout: 'bullets', placeholders: { 7: 'nope' } };
    t.pptxMapping['Worse'] = { layout: 'missing' };
    const { warnings } = validateTemplate(t);
    assert.deepEqual(warnings.map((w) => w.code).sort(), ['unknown-layout', 'unknown-slot']);
  });

  test('malformed roles are errors', () => {
    const t = clone(template);
    t.pptxMapping['Text'] = { layout: 'bullets', placeholders: { abc: 'title' }, extra: 1 };
    const { errors } = validateTemplate(t);
    assert.ok(errors.length >= 1);
  });
});

describe('cards slots', () => {
  /** The default template plus one cards layout. */
  function cardsTemplate() {
    const t = clone(template);
    t.slipr = '0.3'; // 0.3 includes 0.2's placeholder roles
    t.layouts.push({
      id: 'cards', name: 'Cards', file: 'layouts/bullets.html',
      slots: [
        { name: 'title', type: 'text' },
        { name: 'cards', type: 'cards', maxItems: 3, fields: [
          { name: 'image', type: 'image' },
          { name: 'title', type: 'text', required: true, maxLength: 10 },
          { name: 'text', type: 'richtext' },
        ] },
      ],
    });
    return t;
  }

  /** A minimal show with one cards slide. */
  function cardsShow(cards) {
    return {
      slipr: '0.1', id: 'cards', meta: { title: 'Cards' }, template: { ref: 't', version: '^1.0' },
      slides: [{ id: 's-1', layout: 'cards', content: { title: 'Cards', cards } }],
    };
  }

  test('a valid cards value passes, and card images are collected', () => {
    const show = cardsShow([
      { title: 'One', text: '**Bold** text', image: { src: 'images/a.png', alt: 'A' } },
      { title: 'Two' },
    ]);
    assert.deepEqual(validateShow(show, { template: cardsTemplate() }), { ok: true, errors: [], warnings: [] });
    assert.deepEqual(collectImagePaths(show), ['images/a.png']);
  });

  test('field type errors and card warnings', () => {
    const show = cardsShow([
      { title: 42 },
      { title: 'Far too long a title', extra: 'x' },
      { text: 'no title' },
      { title: 'Four' },
    ]);
    const { errors, warnings } = validateShow(show, { template: cardsTemplate() });
    assert.ok(errors.some((e) => e.code === 'slot-type' && e.path === 'slides[0].content.cards[0].title'));
    const found = codes(warnings);
    for (const code of ['too-long', 'unknown-field', 'missing-field', 'too-many-items']) {
      assert.ok(found.includes(code), `expected warning ${code}, got ${found.join(', ')}`);
    }
  });

  test('a cards slot rejects a non-array value', () => {
    const { errors } = validateShow(cardsShow('nope'), { template: cardsTemplate() });
    assert.ok(errors.some((e) => e.code === 'slot-type' && e.path === 'slides[0].content.cards'));
  });

  test('card roles in pptxMapping are checked', () => {
    const t = cardsTemplate();
    t.pptxMapping['Cards'] = { layout: 'cards', placeholders: { 0: 'title', 13: 'cards[0]', 14: 'cards[1].title', 20: 'cards[2].image' } };
    assert.deepEqual(validateTemplate(t), { ok: true, errors: [], warnings: [] });
    t.pptxMapping['Cards'].placeholders = { 1: 'title[0]', 2: 'cards[0].nope', 3: 'cards[3]' };
    assert.deepEqual(codes(validateTemplate(t).warnings).sort(), ['too-many-items', 'unknown-field', 'unknown-slot']);
  });

  test('the Conclusion template is valid', () => {
    const conclusion = readJson('templates/conclusion/template.json');
    assert.deepEqual(validateTemplate(conclusion), { ok: true, errors: [], warnings: [] });
  });

  test('the Conclusion demo show is valid, without warnings, and all images exist', () => {
    const conclusion = readJson('templates/conclusion/template.json');
    const show = readJson('shows/conclusion-demo/show.json');
    const result = validateShow(show, { template: conclusion, imageExists: (src) => exists(`shows/conclusion-demo/${src}`) });
    assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
  });
});

describe('errors', () => {
  test('the broken fixture reports duplicate ids, unknown layout, bad slot type and unknown block type', () => {
    const broken = readJson('shows/fixtures/broken/show.json');
    const result = validateShow(broken, { template });
    assert.equal(result.ok, false);
    const found = codes(result.errors);
    for (const code of ['required', 'duplicate-id', 'unknown-layout', 'slot-type', 'enum']) {
      assert.ok(found.includes(code), `expected error code ${code}, got ${found.join(', ')}`);
    }
    assert.equal(result.errors.filter((e) => e.path === 'slides[2].content.title').length, 1, 'one error per problem');
    assert.ok(result.errors.some((e) => e.path === 'meta' && /"title"/.test(e.message)));
    assert.ok(result.errors.some((e) => e.path === 'slides[2].reader.blocks[0].type'));
  });

  test('typo in a property name is reported', () => {
    const { errors } = validateVariant((s) => { s.slides[0].contnet = {}; });
    assert.ok(errors.some((e) => e.code === 'unknown-property' && e.path === 'slides[0].contnet'));
  });

  test('slot value of the wrong type for the layout', () => {
    const { errors } = validateVariant((s) => { s.slides[6].content.image = 'images/architecture.svg'; });
    assert.ok(errors.some((e) => e.code === 'slot-type' && e.path === 'slides[6].content.image'));
  });

  test('duplicate block id within a slide', () => {
    const { errors } = validateVariant((s) => {
      const blocks = s.slides[1].reader.blocks;
      blocks[1].id = blocks[0].id;
    });
    assert.ok(errors.some((e) => e.code === 'duplicate-id' && e.path === 'slides[1].reader.blocks[1].id'));
  });

  test('duplicate profile id', () => {
    const { errors } = validateVariant((s) => { s.profiles.push({ id: 'dev', label: 'Again' }); });
    assert.ok(errors.some((e) => e.code === 'duplicate-id' && e.path === 'profiles[2].id'));
  });

  test('paths must be "*" or a list of ids', () => {
    const { errors } = validateVariant((s) => { s.paths[1].slides = 'all'; });
    assert.ok(errors.some((e) => e.path === 'paths[1].slides'));
  });
});

describe('warnings', () => {
  const cases = [
    ['unknown glossary term', 'unknown-glossary', (s) => { s.slides[1].reader.blocks[0].md += ' [[nope]]'; }],
    ['link to unknown slide', 'unknown-slide', (s) => { s.slides[1].reader.blocks[0].md += ' [x](#s-missing)'; }],
    ['unknown profile in for', 'unknown-profile', (s) => { s.slides[1].reader.blocks[3].for = ['cfo']; }],
    ['unknown slide in path', 'unknown-slide', (s) => { s.paths[0].slides.push('s-missing'); }],
    ['unknown slide in related', 'unknown-slide', (s) => { s.slides[2].reader.related.push('s-missing'); }],
    ['unknown slide in slide-ref', 'unknown-slide', (s) => { s.slides.find((sl) => sl.id === 's-roadmap').reader.blocks[1].slide = 's-missing'; }],
    ['unknown chapter', 'unknown-chapter', (s) => { s.slides[0].chapter = 'nope'; }],
    ['unknown slot', 'unknown-slot', (s) => { s.slides[0].content.tagline = 'x'; }],
    ['missing required slot', 'missing-slot', (s) => { delete s.slides[1].content.title; }],
    ['too many bullets', 'too-many-items', (s) => { s.slides[1].content.body = Array(8).fill('- item').join('\n'); }],
    ['text too long', 'too-long', (s) => { s.slides[0].content.title = 'x'.repeat(81); }],
    ['missing alt text', 'missing-alt', (s) => { delete s.slides[6].content.image.alt; }],
    ['template version out of range', 'template-version', (s) => { s.template.version = '^2.0'; }],
  ];
  for (const [name, code, mutate] of cases) {
    test(name, () => {
      const result = validateVariant(mutate);
      assert.deepEqual(result.errors, [], 'should not be an error');
      assert.ok(codes(result.warnings).includes(code), `expected warning ${code}, got ${codes(result.warnings).join(', ') || 'none'}`);
    });
  }

  test('missing image file', () => {
    const { warnings } = validateShow(demo, { template, imageExists: (src) => src !== 'images/two-modes.svg' });
    assert.ok(warnings.some((w) => w.code === 'missing-file' && /two-modes/.test(w.message)));
  });

  test('without a template, layout and slot checks are skipped', () => {
    const show = clone(demo);
    show.slides[0].layout = 'anything';
    const result = validateShow(show);
    assert.equal(result.ok, true);
  });
});

describe('extra images (overlays, format 0.2, I-083)', () => {
  const overlay = (extra = {}) => ({ image: { src: 'images/two-modes.svg', alt: 'Two modes' }, x: 0.7, y: 0.1, w: 0.2, h: 0.2, ...extra });
  const withOverlay = (extra, version = '0.2') => validateVariant((s) => {
    s.slipr = version;
    s.slides[1].overlays = [overlay(extra)];
  });

  test('a 0.2 show with an overlay inside the canvas is valid without warnings', () => {
    const result = withOverlay({ fragment: 'fade-up' });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('both 0.1 and 0.2 shows without overlays are valid', () => {
    for (const version of ['0.1', '0.2']) assert.equal(validateVariant((s) => { withoutFormat02(s); s.slipr = version; }).ok, true, version);
    assert.ok(codes(validateVariant((s) => { s.slipr = '0.3'; }).errors).includes('enum'));
  });

  test('overlays in a 0.1 show are an error', () => {
    assert.ok(codes(withOverlay({}, '0.1').errors).includes('format-version'));
  });

  test('outside the canvas, without size, or without alt text: warnings', () => {
    assert.ok(codes(withOverlay({ x: 0.9 }).warnings).includes('outside-canvas'));
    assert.deepEqual(withOverlay({ x: 0.802 }).warnings, [], 'within the tolerance');
    assert.ok(codes(withOverlay({ w: 0 }).warnings).includes('empty-overlay'));
    assert.ok(codes(withOverlay({ image: { src: 'images/two-modes.svg' } }).warnings).includes('missing-alt'));
  });

  test('positions must be fractions, and the image is required', () => {
    assert.ok(codes(withOverlay({ x: 1.5 }).errors).includes('maximum'));
    assert.ok(codes(withOverlay({ y: -0.1 }).errors).includes('minimum'));
    assert.equal(withOverlay({ image: undefined }).ok, false);
    assert.equal(withOverlay({ fragment: 'spin' }).ok, false);
  });

  test('overlay images count as images: collected, and checked for their file', () => {
    const show = clone(demo);
    show.slipr = '0.2';
    show.slides[1].overlays = [overlay({ image: { src: 'images/extra.png', alt: 'Extra' } })];
    assert.ok(collectImagePaths(show).includes('images/extra.png'));
    const { warnings } = validateShow(show, { template, imageExists: (src) => src !== 'images/extra.png' });
    assert.ok(warnings.some((w) => w.code === 'missing-file' && w.path === 'slides[1].overlays[0].image'));
  });
});

describe('text elements (overlays with text, format 0.2, I-089)', () => {
  const textOverlay = (extra = {}) => ({ text: '**New** in 2026', style: { font: 'heading', size: 1.6, bold: true, color: '#FFFFFF', background: '#BC448C', backgroundOpacity: 0.9, radius: 2 }, x: 0.7, y: 0.1, w: 0.2, h: 0.08, ...extra });
  const withText = (extra, version = '0.2') => validateVariant((s) => {
    s.slipr = version;
    s.slides[1].overlays = [textOverlay(extra)];
  });

  test('a 0.2 show with a styled text element is valid without warnings', () => {
    const result = withText({ fragment: true });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('a text element in a 0.1 show is an error', () => {
    assert.ok(codes(withText({}, '0.1').errors).includes('format-version'));
  });

  test('an overlay has either an image or a text, not both or neither', () => {
    assert.equal(withText({ image: { src: 'images/two-modes.svg', alt: 'x' } }).ok, false);
    assert.equal(withText({ text: undefined, style: undefined }).ok, false);
    assert.equal(validateVariant((s) => { s.slides[1].overlays = [{ image: { src: 'images/two-modes.svg', alt: 'x' }, style: {}, x: 0, y: 0, w: 0.1, h: 0.1 }]; }).ok, false, 'no text style on an image');
  });

  test('style values are checked', () => {
    for (const bad of [{ font: 'comic' }, { size: 50 }, { size: 'huge' }, { color: 'red' }, { color: '#12345' }, { backgroundOpacity: 2 }, { borderStyle: 'groove' }, { align: 'justify' }, { shadow: true }]) {
      assert.equal(withText({ style: bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(withText({ style: { size: 'title', valign: 'middle', borderWidth: 0.2, borderStyle: 'dashed', borderColor: '#000', outlineWidth: 0.1, outlineColor: '#fff', padding: 1 } }).ok, true);
  });

  test('empty text, outside the canvas and unknown glossary ids: warnings', () => {
    assert.ok(codes(withText({ text: '  ' }).warnings).includes('empty-text'));
    const outside = withText({ x: 0.9 }).warnings.find((w) => w.code === 'outside-canvas');
    assert.match(outside?.message ?? '', /text element/);
    assert.ok(withText({ text: 'See [[no-such-term]]' }).warnings.some((w) => w.path === 'slides[1].overlays[0].text'));
  });
});

describe('picture styles and opacity (D-014, I-084)', () => {
  const imageSlide = (s) => s.slides.find((x) => x.id === 's-architecture');

  test('the default template offers four picture styles, in format 0.3', () => {
    assert.equal(template.slipr, '0.3');
    assert.deepEqual(template.pictureStyles.map((p) => p.id), ['shadow', 'soft', 'rounded', 'frame']);
    const css = readFileSync(resolve(repoRoot, 'templates/default/theme.css'), 'utf8');
    for (const { id } of template.pictureStyles) assert.match(css, new RegExp(`\\.slipr-picture-${id}\\s*\\{`), `theme.css defines .slipr-picture-${id}`);
  });

  test('picture styles need template format 0.3, with unique ids', () => {
    const t = clone(template);
    t.slipr = '0.2';
    assert.ok(codes(validateTemplate(t).errors).includes('format-version'));
    const u = clone(template);
    u.pictureStyles.push({ id: 'shadow', label: 'Again' });
    assert.ok(codes(validateTemplate(u).errors).includes('duplicate-id'));
    const v = clone(template);
    v.pictureStyles[0].pptxEffect = 'glow';
    assert.equal(validateTemplate(v).ok, false);
  });

  test('a style and an opacity on slot, block and overlay images are valid in 0.2', () => {
    const result = validateVariant((s) => {
      const slide = imageSlide(s);
      slide.content.image = { ...slide.content.image, style: 'shadow', opacity: 0.6 };
      slide.reader.blocks.find((b) => b.type === 'image').image.style = 'frame';
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('in a 0.1 show they are an error', () => {
    const result = validateVariant((s) => {
      withoutFormat02(s);
      s.slipr = '0.1';
      imageSlide(s).content.image.opacity = 0.5;
    });
    assert.ok(codes(result.errors).includes('format-version'));
  });

  test('an unknown style is a warning; opacity must be 0-1', () => {
    assert.ok(codes(validateVariant((s) => { imageSlide(s).content.image.style = 'sparkle'; }).warnings).includes('unknown-picture-style'));
    assert.ok(codes(validateVariant((s) => { imageSlide(s).content.image.opacity = 1.5; }).errors).includes('maximum'));
    assert.equal(validateVariant((s) => { imageSlide(s).content.image.style = 'Not An Id'; }).ok, false);
  });

  test('without a template, styles are not checked', () => {
    const show = clone(demo);
    imageSlide(show).content.image.style = 'sparkle';
    assert.deepEqual(validateShow(show).warnings, []);
  });
});

describe('glossary aliases (I-086)', () => {
  test('aliases are valid in 0.2, an error in 0.1, and must be non-empty strings', () => {
    assert.deepEqual(validateVariant((s) => { s.glossary.layout.aliases = ['layouts', 'base layout']; }).errors, []);
    const old = validateVariant((s) => {
      withoutFormat02(s);
      s.slipr = '0.1';
      s.glossary.layout.aliases = ['layouts'];
    });
    assert.deepEqual(codes(old.errors), ['format-version']);
    assert.equal(validateVariant((s) => { s.glossary.layout.aliases = ['']; }).ok, false);
  });

  test('a name used by two terms is a warning', () => {
    const { warnings } = validateVariant((s) => {
      const [first, second] = Object.keys(s.glossary);
      s.glossary[second].aliases = [s.glossary[first].term.toUpperCase()];
    });
    assert.ok(codes(warnings).includes('duplicate-glossary-name'));
  });
});

describe('robustness', () => {
  for (const input of [null, undefined, 42, 'show', [], {}, { slides: 'nope' }, { slides: [null, 3, {}] }]) {
    test(`never throws on ${JSON.stringify(input)}`, () => {
      const result = validateShow(input, { template });
      assert.equal(result.ok, false);
      assert.ok(result.errors.length > 0);
    });
  }
});

describe('helpers', () => {
  test('collectImagePaths lists unique image sources, local PDFs, graph data files and map layers', () => {
    assert.deepEqual(collectImagePaths(demo).sort(), ['data/netherlands.geojson', 'data/route.geojson', 'data/show-format.json', 'docs/slipr-in-four-pages.pdf', 'images/architecture.svg', 'images/caged-agent.jpg', 'images/json-badge.svg', 'images/two-modes.svg']);
  });

  test('satisfies() handles the supported range forms', () => {
    const yes = [['1.0.0', '^1.0'], ['1.4.2', '^1.0'], ['1.2.3', '~1.2'], ['1.2.9', '~1.2.3'], ['2.0.0', '>=1.5'],
      ['1.2.3', '1.2.3'], ['1.2.7', '1.2'], ['3.0.0', '*'], ['0.3.1', '^0.3']];
    const no = [['2.0.0', '^1.0'], ['0.9.0', '^1.0'], ['1.3.0', '~1.2'], ['1.4.0', '>=1.5'], ['1.2.4', '1.2.3'], ['0.4.0', '^0.3']];
    for (const [v, r] of yes) assert.equal(satisfies(v, r), true, `${v} should satisfy ${r}`);
    for (const [v, r] of no) assert.equal(satisfies(v, r), false, `${v} should not satisfy ${r}`);
    assert.equal(satisfies('1.0.0', 'weird||range'), true, 'unknown syntax is not an alarm');
  });
});
