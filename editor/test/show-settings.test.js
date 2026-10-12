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

describe('metadata, tags and audience options (E-015)', async () => {
  const { parseTags, isLanguageTag, isIsoDate } = await import('../js/show-entities.js');

  test('tags, language and date input', () => {
    assert.deepEqual(parseTags(' ai, agents ,, ai , governance'), ['ai', 'agents', 'governance']);
    assert.deepEqual(parseTags(''), []);
    assert.ok(isLanguageTag('nl') && isLanguageTag('nl-NL') && !isLanguageTag('dutch!') && !isLanguageTag(''));
    assert.ok(isIsoDate('2026-10-11') && !isIsoDate('11-10-2026') && !isIsoDate(''));
  });

  test('setMeta and setSettings remove keys set to undefined', () => {
    let show = actions.setMeta(demo, { language: undefined, description: undefined });
    assert.ok(!('language' in show.meta) && !('description' in show.meta));
    assert.equal(show.meta.title, demo.meta.title);
    show = actions.setSettings(show, { slideNumbers: undefined });
    assert.ok(!('slideNumbers' in show.settings));
    assert.deepEqual(validateShow(show, { template }).errors, []);
  });

  test('setSlideAudience sets and clears fragments, autoAnimate and transition', () => {
    const id = demo.slides[0].id;
    let show = actions.setSlideAudience(demo, { slideId: id, patch: { fragments: 'fade-up', autoAnimate: true, transition: 'zoom' } });
    assert.deepEqual(show.slides[0].audience, { fragments: 'fade-up', autoAnimate: true, transition: 'zoom' });
    assert.deepEqual(validateShow(show, { template }).errors, []);
    show = actions.setSlideAudience(show, { slideId: id, patch: { fragments: false, autoAnimate: false, transition: undefined } });
    assert.ok(!('audience' in show.slides[0]), 'an empty audience object is removed');
    const hidden = actions.setHidden(demo, { slideId: id, audienceHidden: true });
    assert.equal(actions.setSlideAudience(hidden, { slideId: id, patch: { autoAnimate: false } }).slides[0].audience.hidden, true, 'hidden is kept');
  });
});

describe('glossary other names (I-086)', () => {
  test('aliases are parsed, kept on other edits, removed when emptied; the first makes the show 0.2', async () => {
    const { upsertGlossaryTerm, glossaryAliases } = await import('../js/actions.js');
    assert.deepEqual(glossaryAliases(' AI, A.I. ,, ai , artificial intel '), ['AI', 'A.I.', 'artificial intel']);
    assert.deepEqual(glossaryAliases(undefined), []);
    const show = { slipr: '0.1', glossary: { ai: { term: 'artificial intelligence', definition: 'x' } } };
    let next = upsertGlossaryTerm(show, { id: 'ai', term: 'artificial intelligence', definition: 'x', aliases: 'AI, A.I.' });
    assert.deepEqual(next.glossary.ai, { term: 'artificial intelligence', aliases: ['AI', 'A.I.'], definition: 'x' });
    assert.equal(next.slipr, '0.2');
    next = upsertGlossaryTerm(next, { id: 'ai', term: 'AI', definition: 'y', aliases: next.glossary.ai.aliases });
    assert.deepEqual(next.glossary.ai.aliases, ['AI', 'A.I.'], 'kept when another field changes');
    next = upsertGlossaryTerm(next, { id: 'ai', term: 'AI', definition: 'y', aliases: '' });
    assert.equal('aliases' in next.glossary.ai, false);
    assert.equal(next.slipr, '0.2', 'a show stays 0.2');
    assert.equal(upsertGlossaryTerm(show, { id: 'ai', term: 'x', definition: 'x' }).slipr, '0.1');
  });
});
