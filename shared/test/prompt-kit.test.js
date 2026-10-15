import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  buildPrompt, exampleShow, fillBrief, fixUpPrompt, leftOutReason, templateRefFor,
  BRIEF_HEADING, COMPACT_BUDGET, PROMPT_FORMAT,
} from '../prompt-kit.js';
import { validateShow } from '../validate.js';
import { promptFiles } from '../../tools/prompt-kit.js';
import { readJson } from './helpers.js';

const templateIds = readJson('templates/index.json').templates;
const templates = templateIds.map((id) => readJson(`templates/${id}/template.json`));

/** The JSON code block of a prompt's example section. */
function exampleIn(prompt) {
  const section = prompt.slice(prompt.indexOf('## Example'));
  const match = /```json\n([\s\S]*?)\n```/.exec(section);
  assert.ok(match, 'the full prompt has an example code block');
  return JSON.parse(match[1]);
}

describe('Prompt kit (I-080)', () => {
  for (const template of templates) {
    describe(template.id, () => {
      const full = buildPrompt(template, { variant: 'full' });
      const compact = buildPrompt(template, { variant: 'compact' });

      test('every layout appears in both variants', () => {
        for (const layout of template.layouts) {
          assert.ok(full.includes(`\`${layout.id}\``), `full prompt misses layout ${layout.id}`);
          assert.ok(compact.includes(`\`${layout.id}\``), `compact prompt misses layout ${layout.id}`);
        }
      });

      test('layouts a chatbot cannot fill are under "Do not use"', () => {
        const skipped = template.layouts.filter((l) => leftOutReason(l));
        assert.ok(skipped.length > 0);
        const doNotUse = full.slice(full.indexOf('**Do not use**'));
        for (const layout of skipped) assert.match(doNotUse, new RegExp(`- \`${layout.id}\`: `));
      });

      test('the prompt names the exact template reference and format version', () => {
        const ref = templateRefFor(template);
        assert.ok(full.includes(JSON.stringify(ref)));
        assert.ok(full.includes(`"slipr": "${PROMPT_FORMAT}"`));
      });

      test('the worked example validates without errors or warnings', () => {
        const example = exampleIn(full);
        assert.deepEqual(example, exampleShow(template));
        const result = validateShow(example, { template, imageExists: () => true });
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.warnings, []);
      });

      test('the example uses only layouts the prompt allows', () => {
        for (const slide of exampleShow(template).slides) {
          const layout = template.layouts.find((l) => l.id === slide.layout);
          assert.equal(leftOutReason(layout), null, slide.layout);
        }
      });

      test(`compact stays under ${COMPACT_BUDGET} characters and has no example`, () => {
        assert.ok(compact.length < COMPACT_BUDGET, `${compact.length} characters`);
        assert.ok(!compact.includes('## Example'));
        assert.ok(compact.length < full.length);
      });

      test('both variants end with the "Your content" section', () => {
        for (const prompt of [full, compact]) {
          assert.ok(prompt.lastIndexOf(BRIEF_HEADING) > prompt.lastIndexOf('## Check before you answer'));
        }
      });
    });
  }

  test('templateRefFor: root-relative ref, caret range by major (minor for 0.x)', () => {
    assert.deepEqual(templateRefFor({ id: 'default', version: '1.7.0' }), { ref: '/templates/default', version: '^1.0' });
    assert.deepEqual(templateRefFor({ id: 'conclusion', version: '0.1.8' }), { ref: '/templates/conclusion', version: '^0.1' });
  });

  test('the committed prompt files are up to date (npm run prompt)', () => {
    for (const [path, content] of promptFiles()) {
      assert.ok(existsSync(path), `${path} is missing: run npm run prompt`);
      assert.equal(readFileSync(path, 'utf8'), content, `${path} is out of date: run npm run prompt`);
    }
  });

  test('fillBrief replaces the placeholders and keeps the rest', () => {
    const prompt = buildPrompt(templates[0], { variant: 'compact' });
    const filled = fillBrief(prompt, { topic: 'Solar panels at home', slides: 8, reader: false, source: 'Notes:\n- cost\n- yield' });
    assert.ok(filled.startsWith(prompt.slice(0, prompt.indexOf(BRIEF_HEADING))));
    assert.match(filled, /Topic: Solar panels at home\n/);
    assert.match(filled, /Number of slides: 8\n/);
    assert.match(filled, /Reader layer: no\n/);
    assert.match(filled, /Audience: <who will watch or read it>/);
    assert.match(filled, /Source material:\nNotes:\n- cost\n- yield\n$/);
    assert.equal(filled.split(BRIEF_HEADING).length, 2, 'one brief section');
    assert.equal(fillBrief(filled, { topic: 'Wind' }).split(BRIEF_HEADING).length, 2, 'filling twice replaces');
  });

  test('fixUpPrompt lists every error and warning, but not missing images', () => {
    const text = fixUpPrompt(
      [{ path: 'slides[1].layout', code: 'unknown-layout', message: 'unknown layout "quote"' }],
      [
        { path: 'slides[0].content.title', code: 'too-long', message: 'text is longer than 70 characters' },
        { path: 'slides[2].content.image.src', code: 'missing-file', message: 'image file "images/x.png" not found' },
      ],
    );
    assert.match(text, /Errors \(1\):\n- `slides\[1\]\.layout`: unknown layout "quote"/);
    assert.match(text, /Warnings \(1\)/);
    assert.match(text, /text is longer than 70 characters/);
    assert.doesNotMatch(text, /images\/x\.png/);
    assert.match(text, /one ```json code block/);
  });

  test('fixUpPrompt without warnings has no warnings section', () => {
    assert.doesNotMatch(fixUpPrompt([{ path: '', code: 'x', message: 'bad' }]), /Warnings/);
    assert.match(fixUpPrompt([{ path: '', code: 'x', message: 'bad' }]), /`\(root\)`: bad/);
  });
});
