import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { imagePath, imageType, shortHash } from '../js/io/images.js';
import { imageFileFrom, imageSlots, pasteTargetSlot } from '../js/image-input.js';

const conclusion = readJson('templates/conclusion/template.json');
const bytes = new TextEncoder().encode('fake image bytes');

describe('image file names (E-006)', () => {
  test('type from MIME type, else from the extension; others are refused', () => {
    assert.equal(imageType({ type: 'image/png' }), 'image/png');
    assert.equal(imageType({ type: '', name: 'Photo.JPEG' }), 'image/jpeg');
    assert.equal(imageType({ type: 'application/pdf', name: 'doc.pdf' }), null);
    assert.equal(imageType({ type: 'image/tiff', name: 'scan.tif' }), null);
  });

  test('images/<slug>-<hash8>.<ext>, the same bytes give the same name', async () => {
    const hash = await shortHash(bytes);
    assert.match(hash, /^[0-9a-f]{8}$/);
    assert.equal(await imagePath({ name: 'Mijn Foto (1).PNG', type: 'image/png', bytes }), `images/mijn-foto-1-${hash}.png`);
    assert.equal(await imagePath({ name: 'other.png', type: 'image/png', bytes }), `images/other-${hash}.png`);
    assert.equal(await imagePath({ name: 'x.jpeg', type: 'image/jpeg', bytes }), `images/x-${hash}.jpg`);
  });

  test('pasted images ("image.png") are named after the slide and slot', async () => {
    const path = await imagePath({ name: 'image.png', type: 'image/png', bytes }, 'De mens achter de agent-image');
    assert.match(path, /^images\/de-mens-achter-de-agent-image-[0-9a-f]{8}\.png$/);
  });

  test('different bytes give different names', async () => {
    const a = await imagePath({ name: 'a.png', type: 'image/png', bytes });
    const b = await imagePath({ name: 'a.png', type: 'image/png', bytes: new TextEncoder().encode('other') });
    assert.notEqual(a, b);
  });

  test('unsupported files are refused with a readable message', async () => {
    await assert.rejects(imagePath({ name: 'notes.txt', type: 'text/plain', bytes }), /not a supported image/);
  });
});

describe('where an image goes (E-006)', () => {
  const slide = { id: 's-1', layout: 'text-quote-image', content: { title: 'T' } };

  test('image slots of the layout', () => {
    assert.deepEqual(imageSlots(conclusion, slide).map((s) => s.name), ['image']);
    assert.deepEqual(imageSlots(conclusion, { layout: 'text' }), []);
  });

  test('a paste goes to the first empty image slot, else the first image slot, else nowhere', () => {
    assert.equal(pasteTargetSlot(conclusion, slide), 'image');
    assert.equal(pasteTargetSlot(conclusion, { ...slide, content: { image: { src: 'images/a.png' } } }), 'image');
    assert.equal(pasteTargetSlot(conclusion, { layout: 'text', content: {} }), null);
  });

  test('the image is taken from files, or from clipboard items', () => {
    const png = new File([bytes], 'image.png', { type: 'image/png' });
    const txt = new File([bytes], 'a.txt', { type: 'text/plain' });
    assert.equal(imageFileFrom({ files: [txt, png], items: [] }), png);
    assert.equal(imageFileFrom({ files: [], items: [{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png', getAsFile: () => png }] }), png);
    assert.equal(imageFileFrom({ files: [txt], items: [] }), null);
    assert.equal(imageFileFrom(null), null);
  });
});

describe('reusing an image already in the folder (E-006)', async () => {
  const { contentSuffix } = await import('../js/io/images.js');

  test('the content suffix identifies the same image under any name', async () => {
    const a = await imagePath({ name: 'a.png', type: 'image/png', bytes }, 'x');
    const b = await imagePath({ name: 'image.png', type: 'image/png', bytes }, 'another slide-image');
    assert.notEqual(a, b);
    assert.equal(contentSuffix(a), contentSuffix(b));
    assert.equal(contentSuffix('images/photo-16x9.svg'), null, 'files not named by Slipr have no suffix');
  });
});
