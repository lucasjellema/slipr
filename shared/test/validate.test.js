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
    ['unknown slide in slide-ref', 'unknown-slide', (s) => { s.slides[9].reader.blocks[1].slide = 's-missing'; }],
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
  test('collectImagePaths lists unique image sources', () => {
    assert.deepEqual(collectImagePaths(demo).sort(), ['images/architecture.svg', 'images/caged-agent.jpg', 'images/two-modes.svg']);
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
