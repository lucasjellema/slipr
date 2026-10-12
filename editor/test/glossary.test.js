// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import * as actions from '../js/actions.js';
import {
  extractShowTexts,
  scanDeckCandidates,
  suggestWordCompletions,
  getDetailedGlossaryEntry,
  getAllGlossaryEntries,
  filterAndSortGlossary,
  suggestIdForTerm,
} from '../js/glossary-model.js';
import { glossaryReferences } from '../js/show-entities.js';

const demo = readJson('shows/demo/show.json');

describe('Glossary model (I-088)', () => {
  test('extractShowTexts collects text segments across metadata, slides, notes and blocks', () => {
    const segments = extractShowTexts(demo);
    assert.ok(segments.length > 10, 'collected many text segments');
    assert.ok(segments.some((s) => s.text.includes('Slipr') || s.text.includes('HTML')));
    assert.ok(segments.some((s) => s.slideId && s.slideNumber && s.location));
  });

  test('scanDeckCandidates extracts acronyms, technical terms and frequent words not in glossary', () => {
    const candidates = scanDeckCandidates(demo);
    assert.ok(candidates.length > 0, 'found candidates');

    // Acronyms found in deck
    const terms = candidates.map((c) => c.term);
    const lowerTerms = terms.map((t) => t.toLowerCase());

    // Should NOT include terms that are already in the demo show's glossary
    assert.ok(!lowerTerms.includes('reveal.js'), 'already in glossary');
    assert.ok(!lowerTerms.includes('layout'), 'already in glossary');
    assert.ok(!lowerTerms.includes('slot'), 'already in glossary');

    // Should not include common stop words
    assert.ok(!lowerTerms.includes('the'));
    assert.ok(!lowerTerms.includes('slide'));
    assert.ok(!lowerTerms.includes('with'));

    // Top candidates should have counts and slide references
    const top = candidates[0];
    assert.ok(top.count >= 1);
    assert.ok(top.slideCount >= 0);
  });

  test('suggestWordCompletions provides prefix-matched completions', () => {
    /** @type {any} */
    const mockCandidates = [
      { term: 'WebSocket', count: 5, kind: 'technical', slideCount: 3, slides: [] },
      { term: 'WebAssembly', count: 3, kind: 'technical', slideCount: 2, slides: [] },
      { term: 'CSS', count: 10, kind: 'acronym', slideCount: 5, slides: [] },
      { term: 'Component', count: 4, kind: 'capitalized', slideCount: 2, slides: [] },
    ];

    const completions = suggestWordCompletions('web', mockCandidates);
    assert.equal(completions.length, 2);
    assert.equal(completions[0].term, 'WebSocket');
    assert.equal(completions[1].term, 'WebAssembly');

    const cssCompletions = suggestWordCompletions('cs', mockCandidates);
    assert.equal(cssCompletions.length, 1);
    assert.equal(cssCompletions[0].term, 'CSS');
  });

  test('getDetailedGlossaryEntry collects explicit refs, text mentions and orphaned status', () => {
    const detail = getDetailedGlossaryEntry(demo, 'reveal-js');
    assert.ok(detail, 'found detail for reveal-js');
    assert.equal(detail.id, 'reveal-js');
    assert.ok(detail.explicitCount >= 1);
    assert.equal(detail.isOrphaned, false);
    assert.equal(detail.hasDefinition, true);

    // Explicit refs include slideId and slideNumber
    const slideRef = detail.explicitRefs.find((r) => r.slideId);
    assert.ok(slideRef, 'has slide reference with slideId');
    assert.ok(slideRef.slideNumber > 0);

    // An unused term is flagged as orphaned
    const withUnused = actions.upsertGlossaryTerm(demo, {
      id: 'unused-term',
      term: 'Unused Term',
      definition: 'Never mentioned anywhere.',
    });
    const unusedDetail = getDetailedGlossaryEntry(withUnused, 'unused-term');
    assert.ok(unusedDetail);
    assert.equal(unusedDetail.totalUses, 0);
    assert.equal(unusedDetail.isOrphaned, true);
  });

  test('getAllGlossaryEntries returns details for all glossary terms', () => {
    const all = getAllGlossaryEntries(demo);
    assert.equal(all.length, Object.keys(demo.glossary).length);
    assert.ok(all.some((e) => e.id === 'reveal-js'));
  });

  test('filterAndSortGlossary filters by category and search query', () => {
    const withExtra = actions.upsertGlossaryTerm(demo, {
      id: 'z-orphaned',
      term: 'Zebra Protocol',
      definition: '',
    });
    const all = getAllGlossaryEntries(withExtra);

    // Search query
    const searchMatch = filterAndSortGlossary(all, { search: 'zebra' });
    assert.equal(searchMatch.length, 1);
    assert.equal(searchMatch[0].id, 'z-orphaned');

    // Filter orphaned
    const orphaned = filterAndSortGlossary(all, { filter: 'orphaned' });
    assert.ok(orphaned.some((e) => e.id === 'z-orphaned'));

    // Filter in-use
    const inUse = filterAndSortGlossary(all, { filter: 'in-use' });
    assert.ok(!inUse.some((e) => e.id === 'z-orphaned'));
    assert.ok(inUse.some((e) => e.id === 'reveal-js'));

    // Filter no-definition
    const noDef = filterAndSortGlossary(all, { filter: 'no-definition' });
    assert.ok(noDef.some((e) => e.id === 'z-orphaned'));

    // Sort name-desc
    const sortedDesc = filterAndSortGlossary(all, { sort: 'name-desc' });
    assert.equal(sortedDesc[0].term, 'Zebra Protocol');

    // Sort uses-desc
    const sortedUses = filterAndSortGlossary(all, { sort: 'uses-desc' });
    assert.ok(sortedUses[0].totalUses >= sortedUses.at(-1).totalUses);
  });

  test('suggestIdForTerm generates clean slug IDs', () => {
    assert.equal(suggestIdForTerm('Progressive Web App', []), 'progressive-web-app');
    assert.equal(suggestIdForTerm('API', ['api']), 'api-2');
  });

  test('renameGlossaryTerm rewrites term key and all [[oldId]] references', () => {
    const show = actions.addBlock(demo, {
      slideId: demo.slides[0].id,
      block: { type: 'text', md: 'A [[reveal-js]] and [[reveal-js|Reveal]] engine.' },
    });

    const renamed = actions.renameGlossaryTerm(show, { oldId: 'reveal-js', newId: 'revealjs' });
    assert.ok(!('reveal-js' in renamed.glossary));
    assert.ok('revealjs' in renamed.glossary);
    assert.equal(renamed.glossary.revealjs.term, show.glossary['reveal-js'].term);

    // References on slide are updated
    const blockMd = renamed.slides[0].reader.blocks.at(-1).md;
    assert.equal(blockMd, 'A [[revealjs]] and [[revealjs|Reveal]] engine.');

    // References in other glossary entries or slides are updated
    const refs = glossaryReferences(renamed, 'revealjs');
    assert.ok(refs.length >= 1);
    assert.equal(glossaryReferences(renamed, 'reveal-js').length, 0);
  });
});
