import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZip, createZipSource, downloadZip, mimeType, writeZip, crc32 } from '../zip.js';
import { loadShowFromZip, LoadError } from '../load.js';
import { repoRoot } from './helpers.js';

const appBase = pathToFileURL(`${repoRoot}/`);

async function fsFetch(href) {
  try {
    return new Response(await readFile(fileURLToPath(href)), { status: 200 });
  } catch {
    return new Response('', { status: 404, statusText: 'Not Found' });
  }
}

let blobCount = 0;
const createObjectURL = () => `blob:test/${++blobCount}`;

/**
 * Helper to build in-memory zip bytes for testing.
 * @param {Record<string, string | Uint8Array>} files
 * @param {{ deflate?: boolean }} [options]
 * @returns {Uint8Array}
 */
function buildZip(files, { deflate = false } = {}) {
  const encoder = new TextEncoder();
  const fileEntries = Object.entries(files).map(([name, content]) => {
    const raw = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = zlib.crc32(raw);
    const method = deflate ? 8 : 0;
    const compressed = deflate ? new Uint8Array(zlib.deflateRawSync(raw)) : raw;
    return { name, raw, compressed, crc, method };
  });

  /** @type {Uint8Array[]} */
  const localParts = [];
  /** @type {Uint8Array[]} */
  const cdParts = [];
  let offset = 0;

  for (const entry of fileEntries) {
    const nameBytes = encoder.encode(entry.name);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, entry.crc, true);
    lv.setUint32(18, entry.compressed.length, true);
    lv.setUint32(22, entry.raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const localEntryOffset = offset;
    localParts.push(localHeader, entry.compressed);
    offset += localHeader.length + entry.compressed.length;

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, entry.method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.compressed.length, true);
    cv.setUint32(24, entry.raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localEntryOffset, true);
    cdHeader.set(nameBytes, 46);

    cdParts.push(cdHeader);
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of cdParts) cdSize += p.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, fileEntries.length, true);
  ev.setUint16(10, fileEntries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + cdSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of [...localParts, ...cdParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

describe('Zip archive reader (I-087)', () => {
  test('mimeType maps standard presentation extensions', () => {
    assert.equal(mimeType('image.png'), 'image/png');
    assert.equal(mimeType('pic.JPG'), 'image/jpeg');
    assert.equal(mimeType('vector.svg'), 'image/svg+xml');
    assert.equal(mimeType('doc.pdf'), 'application/pdf');
    assert.equal(mimeType('show.json'), 'application/json');
    assert.equal(mimeType('theme.css'), 'text/css');
    assert.equal(mimeType('unknown.xyz'), 'application/octet-stream');
  });

  test('reads uncompressed (STORE) zip files', async () => {
    const zipBytes = buildZip({
      'show.json': '{"meta":{"title":"Store Test"}}',
      'images/logo.png': new Uint8Array([1, 2, 3, 4]),
    }, { deflate: false });

    const entries = await readZip(zipBytes);
    assert.equal(entries.size, 2);
    assert.equal(new TextDecoder().decode(entries.get('show.json')), '{"meta":{"title":"Store Test"}}');
    assert.deepEqual(entries.get('images/logo.png'), new Uint8Array([1, 2, 3, 4]));
  });

  test('reads DEFLATE compressed zip files', async () => {
    const longText = 'Slipr presentations can be compressed with standard deflate! '.repeat(20);
    const zipBytes = buildZip({
      'show.json': longText,
      'data/items.json': '[1, 2, 3]',
    }, { deflate: true });

    const entries = await readZip(zipBytes);
    assert.equal(entries.size, 2);
    assert.equal(new TextDecoder().decode(entries.get('show.json')), longText);
    assert.equal(new TextDecoder().decode(entries.get('data/items.json')), '[1, 2, 3]');
  });

  test('skips directory entries and OS metadata files', async () => {
    const zipBytes = buildZip({
      'images/': '',
      '__MACOSX/._show.json': 'garbage',
      '.DS_Store': 'garbage',
      'show.json': '{"meta":{"title":"Clean"}}',
    });

    const entries = await readZip(zipBytes);
    assert.equal(entries.size, 1);
    assert.ok(entries.has('show.json'));
  });

  test('throws LoadError on invalid or truncated zip data', async () => {
    await assert.rejects(
      () => readZip(new Uint8Array([0, 1, 2, 3])),
      (err) => err instanceof LoadError && err.kind === 'parse' && err.message.includes('not a valid zip')
    );
  });
});

describe('createZipSource: path handling and auto-detection (I-087)', () => {
  test('auto-detects show.json at root', async () => {
    const entries = new Map([
      ['show.json', new TextEncoder().encode('{"meta":{"title":"Root"}}')],
      ['images/hero.jpg', new Uint8Array([1, 2])],
    ]);

    const source = createZipSource(entries, { name: 'root.zip' });
    assert.equal(source.prefix, '');
    assert.equal(await source.readText('show.json'), '{"meta":{"title":"Root"}}');
    const hero = await source.readFile('images/hero.jpg');
    assert.ok(hero instanceof Blob);
    assert.equal(hero.type, 'image/jpeg');
  });

  test('GitHub compatibility: auto-detects show.json in a single top-level directory', async () => {
    const entries = new Map([
      ['my-repo-main/show.json', new TextEncoder().encode('{"meta":{"title":"GitHub Archive"}}')],
      ['my-repo-main/images/logo.svg', new Uint8Array([10, 20])],
    ]);

    const source = createZipSource(entries, { name: 'github.zip' });
    assert.equal(source.prefix, 'my-repo-main/');
    assert.equal(await source.readText('show.json'), '{"meta":{"title":"GitHub Archive"}}');
    const logo = await source.readFile('images/logo.svg');
    assert.ok(logo instanceof Blob);
    assert.equal(logo.type, 'image/svg+xml');
  });

  test('auto-detects single show in nested directory', async () => {
    const entries = new Map([
      ['decks/sales-2026/show.json', new TextEncoder().encode('{"meta":{"title":"Sales"}}')],
      ['decks/sales-2026/images/chart.png', new Uint8Array([3, 4])],
    ]);

    const source = createZipSource(entries, { name: 'sales.zip' });
    assert.equal(source.prefix, 'decks/sales-2026/');
    assert.equal(await source.readText('show.json'), '{"meta":{"title":"Sales"}}');
  });

  test('resolves explicit path parameter (exact and wrapper-stripped)', async () => {
    const entries = new Map([
      ['my-repo-main/shows/intro/show.json', new TextEncoder().encode('{"meta":{"title":"Intro"}}')],
      ['my-repo-main/shows/deep/show.json', new TextEncoder().encode('{"meta":{"title":"Deep"}}')],
    ]);

    // Path without top-level wrapper
    const source1 = createZipSource(entries, { name: 'repo.zip', path: 'shows/intro' });
    assert.equal(source1.prefix, 'my-repo-main/shows/intro/');
    assert.equal(await source1.readText('show.json'), '{"meta":{"title":"Intro"}}');

    // Path with top-level wrapper
    const source2 = createZipSource(entries, { name: 'repo.zip', path: 'my-repo-main/shows/deep' });
    assert.equal(source2.prefix, 'my-repo-main/shows/deep/');
    assert.equal(await source2.readText('show.json'), '{"meta":{"title":"Deep"}}');
  });

  test('multiple shows without path parameter throws clear error listing choices', () => {
    const entries = new Map([
      ['shows/deck-a/show.json', new Uint8Array([1])],
      ['shows/deck-b/show.json', new Uint8Array([2])],
    ]);

    assert.throws(
      () => createZipSource(entries, { name: 'multi.zip' }),
      (err) => err instanceof LoadError && err.status === 400 && err.message.includes('Found multiple presentations')
    );
  });

  test('missing show.json throws clear 404 error', () => {
    const entries = new Map([
      ['readme.txt', new TextEncoder().encode('Just text')],
    ]);

    assert.throws(
      () => createZipSource(entries, { name: 'empty.zip' }),
      (err) => err instanceof LoadError && err.status === 404 && err.message.includes('does not contain a show.json')
    );
  });

  test('prevents path traversal outside show folder', async () => {
    const entries = new Map([
      ['show.json', new TextEncoder().encode('{}')],
      ['secret.txt', new TextEncoder().encode('classified')],
    ]);

    const source = createZipSource(entries, { name: 'traversal.zip' });
    assert.equal(await source.readText('../secret.txt'), null);
    assert.equal(await source.readFile('/secret.txt'), null);
  });
});

describe('downloadZip: downloading and progress (I-087)', () => {
  test('downloads and reports progress', async () => {
    const mockData = new Uint8Array([10, 20, 30, 40]);
    /** @type {any[]} */
    const progressList = [];

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '4' }),
      body: {
        getReader() {
          let done = false;
          return {
            async read() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: mockData };
            },
          };
        },
      },
    });

    const result = await downloadZip('https://example.com/show.zip', {
      fetch: /** @type {any} */ (mockFetch),
      onProgress: (p) => progressList.push(p),
    });

    assert.deepEqual(result, mockData);
    assert.ok(progressList.length > 0);
    assert.equal(progressList.at(-1).percent, 100);
  });

  test('handles 404 response with clear message', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    });

    await assert.rejects(
      () => downloadZip('https://example.com/missing.zip', { fetch: /** @type {any} */ (mockFetch) }),
      (err) => err instanceof LoadError && err.status === 404 && err.message.includes('not found')
    );
  });

  test('handles cross-origin fetch failure with CORS explanation', async () => {
    // In Node globalThis.location is undefined by default, so set a temporary origin
    const prevLocation = globalThis.location;
    // @ts-ignore
    globalThis.location = new URL('http://localhost:8080/viewer/');
    try {
      const mockFetch = async () => {
        throw new TypeError('Failed to fetch');
      };
      await assert.rejects(
        () => downloadZip('https://external-host.com/show.zip', { fetch: /** @type {any} */ (mockFetch) }),
        (err) => err instanceof LoadError && err.kind === 'fetch' && err.message.includes('CORS') && err.message.includes('Access-Control-Allow-Origin')
      );
    } finally {
      // @ts-ignore
      globalThis.location = prevLocation;
    }
  });
});

describe('loadShowFromZip: integration with loadShow (I-087)', () => {
  test('loads show, maps assets to blob URLs and validates', async () => {
    const showJson = {
      slipr: '0.1',
      id: 'zip-demo',
      meta: { title: 'Zip Presentation', language: 'en' },
      template: { ref: '/templates/default' },
      slides: [
        {
          id: 's-1',
          layout: 'title',
          content: { title: 'Zip Title', subtitle: 'Subtitle' },
        },
        {
          id: 's-2',
          layout: 'image-full',
          content: {
            image: {
              src: 'images/photo.png',
              alt: 'Present in archive',
            },
          },
        },
      ],
    };

    const entries = new Map([
      ['show.json', new TextEncoder().encode(JSON.stringify(showJson))],
      ['images/photo.png', new Uint8Array([1, 2, 3])],
    ]);

    const source = createZipSource(entries, { name: 'test.zip' });
    const ctx = await loadShowFromZip(source, { appBase, fetch: fsFetch, createObjectURL });

    assert.equal(ctx.show.meta.title, 'Zip Presentation');
    assert.equal(ctx.template.id, 'default');
    assert.ok(ctx.showUrl.href.startsWith('slipr-zip:///test.zip/'));
    assert.equal(ctx.validation.ok, true);
    assert.equal(ctx.validation.errors.length, 0);
    assert.match(ctx.resolveAsset('images/photo.png'), /^blob:test\//);
  });

  test('reports missing images inside zip as warnings', async () => {
    const showJson = {
      slipr: '0.1',
      id: 'zip-missing-img',
      meta: { title: 'Missing Image Test', language: 'en' },
      template: { ref: '/templates/default' },
      slides: [
        {
          id: 's-1',
          layout: 'image-full',
          content: {
            image: {
              src: 'images/nonexistent.png',
              alt: 'Missing photo',
            },
          },
        },
      ],
    };

    const entries = new Map([
      ['show.json', new TextEncoder().encode(JSON.stringify(showJson))],
    ]);

    const source = createZipSource(entries, { name: 'missing-img.zip' });
    const ctx = await loadShowFromZip(source, { appBase, fetch: fsFetch, createObjectURL });

    assert.equal(ctx.validation.ok, true);
    assert.ok(ctx.validation.warnings.some((w) => w.code === 'missing-file' && w.message.includes('nonexistent.png')));
  });
});

describe('Zip archive writer (I-092)', () => {
  test('crc32 accurately computes checksums matching zlib', () => {
    const testCases = [
      new Uint8Array(0),
      new TextEncoder().encode('hello'),
      new TextEncoder().encode('The quick brown fox jumps over the lazy dog'),
      new Uint8Array([0, 1, 2, 3, 255, 254, 253, 128, 64, 32]),
    ];
    for (const bytes of testCases) {
      assert.equal(crc32(bytes), zlib.crc32(bytes));
    }
  });

  test('writes uncompressed (STORE) zip files decodable by readZip', async () => {
    const files = {
      'hello.txt': 'Hello World!',
      'data/number.bin': new Uint8Array([10, 20, 30, 40]),
    };
    const zipBytes = await writeZip(files, { deflate: false });
    const entries = await readZip(zipBytes);

    assert.equal(entries.size, 2);
    assert.equal(new TextDecoder().decode(entries.get('hello.txt')), 'Hello World!');
    assert.deepEqual(entries.get('data/number.bin'), new Uint8Array([10, 20, 30, 40]));
  });

  test('writes compressed (DEFLATE) zip files decodable by readZip', async () => {
    const longText = 'Repeat text '.repeat(100);
    const files = new Map([
      ['doc.txt', longText],
      ['empty.txt', ''],
    ]);
    const zipBytes = await writeZip(files, { deflate: true });
    // Compressed size should be much smaller than raw uncompressed
    assert.ok(zipBytes.length < longText.length);

    const entries = await readZip(zipBytes);
    assert.equal(entries.size, 2);
    assert.equal(new TextDecoder().decode(entries.get('doc.txt')), longText);
    assert.deepEqual(entries.get('empty.txt'), new Uint8Array(0));
  });

  test('handles Blob, ArrayBuffer, and UTF-8 filenames', async () => {
    const files = [
      ['docs/résumé.txt', new Blob(['Mon résumé avec accents et emojis 🚀'])],
      ['images/buffer.dat', new Uint8Array([1, 2, 3]).buffer],
    ];
    const zipBytes = await writeZip(files);
    const entries = await readZip(zipBytes);

    assert.equal(entries.size, 2);
    assert.equal(new TextDecoder().decode(entries.get('docs/résumé.txt')), 'Mon résumé avec accents et emojis 🚀');
    assert.deepEqual(entries.get('images/buffer.dat'), new Uint8Array([1, 2, 3]));
  });

  test('round-trip with loadShowFromZip', async () => {
    const showJson = {
      slipr: '0.1',
      id: 'round-trip-zip',
      meta: { title: 'Round Trip Test', language: 'en' },
      template: { ref: '/templates/default' },
      slides: [
        {
          id: 's-1',
          layout: 'title',
          content: { title: 'Hello from Zip Writer' },
        },
      ],
    };

    const zipBytes = await writeZip({
      'show.json': JSON.stringify(showJson, null, 2),
      'images/icon.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    const entries = await readZip(zipBytes);
    const source = createZipSource(entries, { name: 'round-trip.zip' });
    const ctx = await loadShowFromZip(source, { appBase, fetch: fsFetch, createObjectURL });

    assert.equal(ctx.show.id, 'round-trip-zip');
    assert.equal(ctx.show.meta.title, 'Round Trip Test');
    assert.equal(ctx.validation.ok, true);
  });
});

