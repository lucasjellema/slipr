import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterHtml, attributes, isTagCloud, staticHtml, tagCloudHtml, tagCloudModel, tagCloudStepState, tagKey, termsFromRows, weightText,
} from '../embeds/tag-cloud.js';
import { isTable } from '../embeds/table.js';
import { embedKindForBlock, embedKindForSlot, usedEmbedKinds } from '../embeds/index.js';
import { validateShow } from '../validate.js';
import { readJson, clone, codes } from './helpers.js';

const GLOSSARY = {
  'reader-layer': { term: 'reader layer', definition: 'Depth for readers.' },
  layout: { term: 'layout', aliases: ['layouts'], definition: 'A slide design.' },
};

const CLOUD = {
  terms: [
    { text: 'Small', weight: 1 },
    { text: 'Reader layer', weight: 10 },
    { text: 'Middle', weight: 5 },
    { text: 'layouts', weight: 3 },
    { text: 'Heavy', weight: 8 },
  ],
};

describe('tag cloud model (I-105)', () => {
  it('ranks by weight, sizes from 0 to 1 and puts the heaviest in the middle', () => {
    const { tags } = tagCloudModel(CLOUD);
    assert.deepEqual(tags.map((t) => t.text), ['layouts', 'Heavy', 'Reader layer', 'Middle', 'Small']);
    const heavy = tags.find((t) => t.text === 'Reader layer');
    assert.equal(heavy?.rank, 1);
    assert.equal(heavy?.level, 1);
    assert.equal(heavy?.tier, 4);
    const small = tags.find((t) => t.text === 'Small');
    assert.equal(small?.level, 0);
    assert.equal(small?.tier, 1);
  });

  it('orders by weight, alphabetically or as written', () => {
    assert.deepEqual(tagCloudModel({ ...CLOUD, order: 'weight' }).tags.map((t) => t.rank), [1, 2, 3, 4, 5]);
    assert.deepEqual(tagCloudModel({ ...CLOUD, order: 'alphabetical' }).tags.map((t) => t.text), ['Heavy', 'layouts', 'Middle', 'Reader layer', 'Small']);
    assert.deepEqual(tagCloudModel({ ...CLOUD, order: 'none' }).tags.map((t) => t.text), CLOUD.terms.map((t) => t.text));
  });

  it('merges repeated terms (case and accents ignored), adding up their weights', () => {
    const { tags } = tagCloudModel({ terms: [{ text: 'Café' }, { text: 'cafe', weight: 2 }, { text: 'Tea' }], order: 'weight' });
    assert.deepEqual(tags.map((t) => [t.text, t.weight]), [['Café', 3], ['Tea', 1]]);
  });

  it('keeps the maxTerms heaviest; equal weights are a middle size', () => {
    assert.deepEqual(tagCloudModel({ ...CLOUD, maxTerms: 2, order: 'weight' }).tags.map((t) => t.text), ['Reader layer', 'Heavy']);
    const even = tagCloudModel({ terms: [{ text: 'a' }, { text: 'b' }] }).tags;
    assert.deepEqual(even.map((t) => t.level), [0.5, 0.5]);
  });

  it('links terms to the glossary by term or alias, or by a given id', () => {
    const { tags } = tagCloudModel({ terms: [...CLOUD.terms, { text: 'Other', glossary: 'reader-layer' }] }, null, { glossary: GLOSSARY });
    const by = Object.fromEntries(tags.map((t) => [t.text, t.glossary]));
    assert.equal(by['Reader layer'], 'reader-layer');
    assert.equal(by.layouts, 'layout');
    assert.equal(by.Other, 'reader-layer');
    assert.equal(by.Heavy, undefined);
  });

  it('reads CSV rows: a term and a weight column, or counts repeated rows', () => {
    assert.deepEqual(termsFromRows([['term', 'weight'], ['A', '3'], ['B', '1,5']], {}, { decimalComma: true }), [{ text: 'A', weight: 3 }, { text: 'B', weight: 1.5 }]);
    assert.deepEqual(termsFromRows([['answer'], ['A'], [''], ['B']], {}), [{ text: 'A', weight: undefined }, { text: 'B', weight: undefined }]);
    assert.deepEqual(termsFromRows([['id', 'name', 'n'], ['1', 'A', '4']], { termColumn: 'name', weightColumn: 'n' }), [{ text: 'A', weight: 4 }]);
    // A second column with text is not a weight.
    assert.deepEqual(termsFromRows([['term', 'note'], ['A', 'x']], {}), [{ text: 'A', weight: undefined }]);
    const { tags } = tagCloudModel({ data: 'data/a.csv', order: 'weight' }, [['answer'], ['Talks'], ['Docs'], ['talks']]);
    assert.deepEqual(tags.map((t) => [t.text, t.weight]), [['Talks', 2], ['Docs', 1]]);
  });
});

describe('tag cloud steps and markup (I-105)', () => {
  it('reveals the heaviest terms and highlights by name', () => {
    const steps = [{ terms: 2 }, { highlight: ['reader LAYER', 'Heavy'] }, { terms: 'all' }, { highlight: 'Small' }, { highlight: null }];
    assert.deepEqual(tagCloudStepState(steps, 0), { limit: 0, highlight: null });
    assert.deepEqual(tagCloudStepState(steps, 1), { limit: 2, highlight: null });
    assert.deepEqual([...(tagCloudStepState(steps, 2).highlight ?? [])], ['reader layer', 'heavy']);
    assert.deepEqual(tagCloudStepState(steps, 3), { limit: Infinity, highlight: null });
    assert.deepEqual([...(tagCloudStepState(steps, 4).highlight ?? [])], ['small']);
    assert.equal(tagCloudStepState(steps, 5).highlight, null);
    assert.equal(tagCloudStepState([{ highlight: 'x' }], 0).limit, Infinity);
  });

  it('writes a list: buttons with glossary ids in reader mode, text and a read-out weight in audience mode', () => {
    const model = tagCloudModel(CLOUD, null, { glossary: GLOSSARY });
    const reader = tagCloudHtml(model, { mode: 'reader', weightLabel: 'mentions' });
    assert.match(reader, /^<ul class="slipr-tag-cloud-list" role="list">/);
    assert.match(reader, /<button type="button" class="slipr-tag-cloud-term" data-tag="Reader layer" data-tag-weight="10 mentions" data-term="reader-layer" aria-label="Reader layer, 10 mentions">Reader layer<\/button>/);
    const audience = tagCloudHtml(model, { mode: 'audience', limit: 2, highlight: new Set([tagKey('Heavy')]) });
    assert.doesNotMatch(audience, /<button/);
    assert.match(audience, /has-highlight/);
    assert.match(audience, /class="slipr-tag-cloud-item is-highlight" data-rank="2"/);
    assert.match(audience, /class="slipr-tag-cloud-item is-hidden" data-rank="3"[^>]*aria-hidden="true"/);
    assert.match(audience, /<span class="slipr-tag-cloud-weight"> \(weight 8\)<\/span>/);
  });

  it('escapes terms', () => {
    const html = tagCloudHtml(tagCloudModel({ terms: [{ text: '<b>"x"</b>' }] }), { mode: 'reader' });
    assert.ok(!html.includes('<b>'));
    assert.match(html, /&lt;b&gt;&quot;x&quot;&lt;\/b&gt;/);
  });

  it('weights read as a count with a label, or as a weight', () => {
    assert.equal(weightText(12, 'answers'), '12 answers');
    assert.equal(weightText(2.345), 'weight 2.35');
  });

  it('static content, attributes and steps for the embed', () => {
    const ctx = { resolveAsset: (/** @type {string} */ s) => `/show/${s}`, show: { glossary: GLOSSARY } };
    assert.match(staticHtml(CLOUD, ctx, { mode: 'reader' }).html, /data-term="layout"/);
    assert.match(staticHtml({ data: 'data/k.csv', order: 'weight' }, ctx).html, /The terms are in k\.csv\./);
    const attrs = attributes({ data: 'data/k.csv', fallback: { src: 'a.png' } }, ctx, { mode: 'audience', slot: true });
    assert.equal(attrs['data-tag-cloud-src'], '/show/data/k.csv');
    assert.equal(attrs['data-tag-cloud-mode'], 'audience');
    assert.ok(!attrs['data-tag-cloud'].includes('fallback'));
    assert.deepEqual(Object.keys(JSON.parse(attrs['data-tag-cloud-glossary'])), ['reader-layer', 'layout']);
    assert.equal(afterHtml({ steps: [{ terms: 1 }, { terms: 2 }] }, { mode: 'audience', slot: true }).match(/fragment/g)?.length, 2);
    assert.equal(afterHtml({ steps: [{ terms: 1 }] }, { mode: 'reader', slot: true }), '');
  });

  it('is told apart from a table by shape; registered as slot and block kind', () => {
    assert.equal(isTagCloud(CLOUD), true);
    assert.equal(isTagCloud({ data: 'data/k.csv', weightLabel: 'votes' }), true);
    assert.equal(isTagCloud({ data: 'data/k.csv', steps: [{ terms: 3 }] }), true);
    assert.equal(isTagCloud({ data: 'data/k.csv' }), false, 'a bare CSV file is taken for a table');
    assert.equal(isTagCloud({ columns: [], rows: [] }), false);
    assert.equal(isTable(CLOUD), false);
    assert.equal(embedKindForSlot('tag-cloud'), 'tag-cloud');
    assert.equal(embedKindForBlock('tag-cloud'), 'tag-cloud');
    assert.ok(usedEmbedKinds(readJson('shows/demo/show.json')).has('tag-cloud'));
  });
});

describe('tag cloud validation (I-105)', () => {
  const demo = readJson('shows/demo/show.json');
  const template = readJson('templates/default/template.json');
  /** @param {(cloud: any, show: any) => void} change @param {string} [version] */
  const withCloud = (change, version = '0.2') => {
    const show = clone(demo);
    show.slipr = version;
    change(show.slides.find((/** @type {any} */ x) => x.id === 's-tag-cloud').content.cloud, show);
    return validateShow(show, { template });
  };

  it('the demo slide and CSV block are valid; a tag cloud in a 0.1 show is an error', () => {
    assert.deepEqual(withCloud(() => {}).errors, []);
    assert.deepEqual(withCloud(() => {}).warnings, []);
    assert.ok(codes(withCloud(() => {}, '0.1').errors).includes('format-version'));
  });

  it('a term without text, a negative weight, an unknown order or step, a non-CSV file are errors', () => {
    assert.equal(withCloud((c) => { c.terms.push({ weight: 2 }); }).ok, false);
    assert.equal(withCloud((c) => { c.terms[0].weight = -1; }).ok, false);
    assert.equal(withCloud((c) => { c.order = 'random'; }).ok, false);
    assert.equal(withCloud((c) => { c.steps.push({ terms: -1 }); }).ok, false);
    assert.equal(withCloud((c) => { c.steps.push({ pulse: 'x' }); }).ok, false);
    assert.equal(withCloud((_, s) => { s.slides.find((/** @type {any} */ x) => x.id === 's-tag-cloud').content.cloud = { data: 'data/k.json' }; }).ok, false);
    assert.equal(withCloud((_, s) => { s.slides.find((/** @type {any} */ x) => x.id === 's-tag-cloud').content.cloud = 'words'; }).ok, false);
  });

  it('steps on a tag cloud block are an error', () => {
    const show = clone(demo);
    const block = show.slides.find((/** @type {any} */ x) => x.id === 's-tag-cloud').reader.blocks.find((/** @type {any} */ b) => b.type === 'tag-cloud');
    block.steps = [{ terms: 1 }];
    assert.equal(validateShow(show, { template }).ok, false);
  });

  it('an unknown highlighted term, an unknown glossary id and a missing file are warnings', () => {
    assert.ok(codes(withCloud((c) => { c.steps.push({ highlight: 'nope' }); }).warnings).includes('unknown-term'));
    assert.ok(codes(withCloud((c) => { c.steps.push({ highlight: ['JSON', 'nope'] }); }).warnings).includes('unknown-term'));
    assert.deepEqual(withCloud((c) => { c.steps.push({ highlight: 'json' }); }).warnings, [], 'names match ignoring case');
    assert.ok(codes(withCloud((c) => { c.terms[0].glossary = 'nope'; }).warnings).includes('unknown-glossary'));
    const { warnings } = validateShow(clone(demo), { template, imageExists: (src) => src !== 'data/keywords.csv' });
    assert.ok(warnings.some((w) => w.code === 'missing-file' && w.message.includes('keywords.csv')));
  });
});
