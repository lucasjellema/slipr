import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip, createZipSource } from '../../shared/zip.js';
import { createStore } from '../js/store.js';
import { exportZip } from '../js/export-zip.js';
import { openZipFile } from '../js/files.js';

describe('Editor exportZip (I-092)', () => {
  test('packages current in-memory show into a zip archive with show.json and assets', async () => {
    const show = {
      slipr: '0.1',
      id: 'my-talk',
      meta: { title: 'My Awesome Talk', language: 'en' },
      template: { ref: '/templates/default' },
      slides: [
        {
          id: 's-1',
          layout: 'title',
          content: { title: 'Welcome' },
        },
        {
          id: 's-2',
          layout: 'image-full',
          content: {
            image: { src: 'images/photo.png', alt: 'A test photo' },
          },
        },
      ],
    };

    const inMemoryAssets = new Map([
      ['images/photo.png', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })],
    ]);

    const store = createStore(show, { inMemoryAssets });

    // Export with download: false so it runs headless in test
    const result = await exportZip(store, { download: false });
    assert.ok(result);
    assert.equal(result.name, 'my-talk.zip');
    assert.equal(result.warnings.length, 0);

    // Verify the generated zip is valid and decodable
    const entries = await readZip(result.bytes);
    assert.ok(entries.has('show.json'));
    assert.ok(entries.has('images/photo.png'));

    const parsedShow = JSON.parse(new TextDecoder().decode(entries.get('show.json')));
    assert.equal(parsedShow.id, 'my-talk');
    assert.equal(parsedShow.meta.title, 'My Awesome Talk');
    assert.deepEqual(entries.get('images/photo.png'), new Uint8Array([1, 2, 3, 4]));
  });

  test('includes unsaved edits made to the show', async () => {
    const show = {
      slipr: '0.1',
      id: 'editable-show',
      meta: { title: 'Original Title' },
      slides: [{ id: 's-1', layout: 'title', content: { title: 'Original' } }],
    };

    const store = createStore(show);
    // Dispatch an in-memory modification
    store.dispatch('setMeta', { title: 'Updated Title After Edit' });

    const result = await exportZip(store, { download: false });
    assert.ok(result);

    const entries = await readZip(result.bytes);
    const parsedShow = JSON.parse(new TextDecoder().decode(entries.get('show.json')));
    assert.equal(parsedShow.meta.title, 'Updated Title After Edit');
  });

  test('preserves existing assets when show was loaded from a zip source', async () => {
    const originalShow = {
      slipr: '0.1',
      id: 'zip-source-show',
      meta: { title: 'Loaded from Zip' },
      slides: [{ id: 's-1', layout: 'title', content: { title: 'First Slide' } }],
    };

    const originalEntries = new Map([
      ['show.json', new TextEncoder().encode(JSON.stringify(originalShow))],
      ['images/logo.svg', new TextEncoder().encode('<svg>logo</svg>')],
      ['data/chart.json', new TextEncoder().encode('{"value": 42}')],
    ]);

    const zipSource = createZipSource(originalEntries, { name: 'original.zip' });
    const store = createStore(originalShow, { zipSource });

    // Add an in-memory asset
    store.state.inMemoryAssets?.set('images/new.png', new Blob([new Uint8Array([9, 8, 7])]));

    const result = await exportZip(store, { download: false });
    assert.ok(result);

    const entries = await readZip(result.bytes);
    assert.ok(entries.has('show.json'));
    assert.ok(entries.has('images/logo.svg'));
    assert.ok(entries.has('data/chart.json'));
    assert.ok(entries.has('images/new.png'));
    assert.equal(new TextDecoder().decode(entries.get('images/logo.svg')), '<svg>logo</svg>');
  });
});

describe('Editor openZipFile (I-092)', () => {
  test('decompresses zip file and starts editor with zipSource', async () => {
    const show = {
      slipr: '0.1',
      id: 'import-test',
      meta: { title: 'Imported Deck' },
      template: { ref: '/templates/default' },
      slides: [{ id: 's-1', layout: 'title', content: { title: 'Hello' } }],
    };

    const zipBytes = await writeZip({
      'show.json': JSON.stringify(show),
      'images/icon.png': new Uint8Array([1, 2, 3]),
    });

    const file = new File([zipBytes], 'deck.zip', { type: 'application/zip' });

    let startedContext = null;
    let startedSource = null;

    await openZipFile(undefined, {
      file,
      onStartEditor: async (ctx, source) => {
        startedContext = ctx;
        startedSource = source;
      },
    });

    assert.ok(startedContext);
    assert.equal(startedContext.show.id, 'import-test');
    assert.equal(startedContext.show.meta.title, 'Imported Deck');
    assert.ok(startedSource.zipSource);
    assert.equal(startedSource.zipSource.name, 'deck.zip');
    assert.ok(startedSource.zipSource.getBytes('images/icon.png'));
  });

  test('switches context in an existing running store', async () => {
    const initialShow = {
      slipr: '0.1',
      id: 'initial',
      meta: { title: 'Initial Show' },
      slides: [{ id: 's-1', layout: 'title', content: { title: 'Initial' } }],
    };
    const store = createStore(initialShow);

    const newShow = {
      slipr: '0.1',
      id: 'switched',
      meta: { title: 'Switched Show' },
      template: { ref: '/templates/default' },
      slides: [{ id: 's-new', layout: 'title', content: { title: 'New' } }],
    };
    const zipBytes = await writeZip({
      'show.json': JSON.stringify(newShow),
    });
    const file = new File([zipBytes], 'switched.zip', { type: 'application/zip' });

    await openZipFile(store, { file });

    assert.equal(store.state.show.id, 'switched');
    assert.equal(store.state.show.meta.title, 'Switched Show');
    assert.equal(store.state.dirty, false);
    assert.ok(store.state.zipSource);
  });
});
