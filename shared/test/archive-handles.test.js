import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rememberArchive, recallArchive, listArchives, forgetArchive, clearArchives } from '../archive-handles.js';

describe('Archive handles in browser storage (archive-handles.js)', () => {
  beforeEach(async () => {
    await clearArchives();
  });

  test('remembers and recalls an archive buffer with metadata', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const key = await rememberArchive(data, { name: 'talk.zip', title: 'My Awesome Talk' });

    assert.ok(key, 'returned key');
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 8);

    const record = await recallArchive(key);
    assert.ok(record, 'record found');
    assert.equal(record.key, key);
    assert.equal(record.name, 'talk.zip');
    assert.equal(record.title, 'My Awesome Talk');
    assert.deepEqual(new Uint8Array(record.data), data);
    assert.ok(record.lastOpened > 0);
  });

  test('recalls null for unknown key', async () => {
    const record = await recallArchive('nonexistent');
    assert.equal(record, null);
  });

  test('lists remembered archives in reverse chronological order', async () => {
    const key1 = await rememberArchive(new Uint8Array([1]), { name: 'first.zip', title: 'First' });
    // slight delay for timestamp ordering
    await new Promise((r) => setTimeout(r, 5));
    const key2 = await rememberArchive(new Uint8Array([2]), { name: 'second.zip', title: 'Second' });

    const list = await listArchives();
    assert.equal(list.length, 2);
    assert.equal(list[0].key, key2);
    assert.equal(list[1].key, key1);
  });

  test('forgets an archive', async () => {
    const key = await rememberArchive(new Uint8Array([1, 2]), { name: 'forget-me.zip' });
    assert.ok(await recallArchive(key));

    await forgetArchive(key);
    assert.equal(await recallArchive(key), null);
    const list = await listArchives();
    assert.equal(list.length, 0);
  });

  test('handles ArrayBuffer and Blob input', async () => {
    const buf = new Uint8Array([10, 20, 30]).buffer;
    const key1 = await rememberArchive(buf, { name: 'arraybuf.zip' });
    const rec1 = await recallArchive(key1);
    assert.ok(rec1);
    assert.equal(rec1.name, 'arraybuf.zip');

    if (typeof Blob !== 'undefined') {
      const blob = new Blob([new Uint8Array([40, 50])]);
      const key2 = await rememberArchive(blob, { name: 'blob.zip' });
      const rec2 = await recallArchive(key2);
      assert.ok(rec2);
      assert.equal(rec2.name, 'blob.zip');
    }
  });
});
