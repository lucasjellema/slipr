import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import { chapterUsage, glossaryReferences, profileUsage, uniqueId, unlinkGlossary } from '../js/show-entities.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const warningCodes = (show) => validateShow(show, { template }).warnings.map((w) => w.code);

describe('show entities (E-009)', () => {
  test('uniqueId: kebab-case from the label, numbered when taken', () => {
    assert.equal(uniqueId('Product Owner', []), 'product-owner');
    assert.equal(uniqueId('Product Owner', ['product-owner']), 'product-owner-2');
    assert.equal(uniqueId('Product Owner', ['product-owner', 'product-owner-2']), 'product-owner-3');
    assert.equal(uniqueId('***', [], 'term'), 'term');
  });

  test('glossaryReferences finds every [[id]] and [[id|text]], per slide', () => {
    const refs = glossaryReferences(demo, 'reveal-js');
    assert.ok(refs.length >= 1);
    assert.ok(refs.every((r) => r.count >= 1 && /^(Slide \d+|Glossary)/.test(r.where)));
    assert.deepEqual(glossaryReferences(demo, 'no-such-term'), []);
  });

  test('unlinkGlossary turns references into plain text and leaves others alone', () => {
    const show = actions.addBlock(demo, { slideId: demo.slides[0].id, block: { type: 'text', md: 'A [[slot]] and [[slot|named place]] next to [[layout]].' } });
    const next = unlinkGlossary(show, 'slot', 'slot');
    assert.equal(next.slides[0].reader.blocks.at(-1).md, 'A slot and named place next to [[layout]].');
    assert.deepEqual(glossaryReferences(next, 'slot'), []);
    assert.equal(next.slides[5], show.slides[5], 'slides without the term keep their identity');
  });

  test('usage counts for profiles and chapters', () => {
    assert.ok(profileUsage(demo, 'dev') > 0);
    assert.equal(profileUsage(demo, 'nobody'), 0);
    assert.ok(chapterUsage(demo, 'why') > 0);
  });
});

describe('show settings actions (E-009)', () => {
  test('deleteGlossaryTerm: plain delete leaves warnings, unlink leaves none', () => {
    const kept = actions.deleteGlossaryTerm(demo, { id: 'reveal-js' });
    assert.ok(warningCodes(kept).includes('unknown-glossary'));
    const unlinked = actions.deleteGlossaryTerm(demo, { id: 'reveal-js', unlink: true });
    assert.ok(!('reveal-js' in unlinked.glossary));
    assert.deepEqual(warningCodes(unlinked), []);
  });

  test('moveShowItem reorders chapters, profiles and paths', () => {
    const ids = (show, list) => show[list].map((x) => x.id);
    const next = actions.moveShowItem(demo, { list: 'chapters', id: demo.chapters[2].id, toIndex: 0 });
    assert.deepEqual(ids(next, 'chapters'), [demo.chapters[2].id, demo.chapters[0].id, demo.chapters[1].id]);
    assert.equal(actions.moveShowItem(demo, { list: 'profiles', id: 'nope', toIndex: 0 }), demo);
    assert.equal(actions.moveShowItem(demo, { list: 'profiles', id: demo.profiles[0].id, toIndex: -5 }), demo, 'clamped to the same place');
  });

  test('a new profile, glossary term and path from the UI defaults are valid', () => {
    let show = actions.upsertProfile(demo, { id: uniqueId('Designer', demo.profiles.map((p) => p.id)), label: 'Designer' });
    show = actions.upsertGlossaryTerm(show, { id: uniqueId('New term', Object.keys(show.glossary)), term: 'New term', definition: '' });
    show = actions.upsertPath(show, { id: uniqueId('New route', show.paths.map((p) => p.id)), label: 'New route', slides: [show.slides[0].id] });
    show = actions.upsertChapter(show, { id: uniqueId('New chapter', show.chapters.map((c) => c.id)), title: 'New chapter' });
    assert.deepEqual(validateShow(show, { template }).errors, []);
  });
});

test('upserts remove optional fields patched to undefined (emptied summary or description)', () => {
  let show = actions.upsertChapter(demo, { id: demo.chapters[0].id, summary: undefined });
  assert.ok(!('summary' in show.chapters[0]));
  assert.equal(show.chapters[0].title, demo.chapters[0].title, 'other fields stay');
  show = actions.upsertProfile(show, { id: demo.profiles[0].id, description: undefined });
  assert.ok(!('description' in show.profiles[0]));
  show = actions.upsertPath(show, { id: demo.paths[0].id, description: undefined });
  assert.ok(!('description' in show.paths[0]));
  assert.deepEqual(validateShow(show, { template }).errors, []);
});
