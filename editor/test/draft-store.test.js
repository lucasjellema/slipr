// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, clone } from '../../shared/test/helpers.js';
import {
  getDraftKey,
  formatDraftTime,
  memoryAdapter,
  localStorageAdapter,
  DraftStore,
  startAutosave,
} from '../js/io/draft-store.js';
import { createStore } from '../js/store.js';
import { restoreDraft } from '../js/actions.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('getDraftKey (I-020)', () => {
  test('returns folder:key when folderKey is present', () => {
    assert.equal(getDraftKey({ folderKey: 'ab12cd34' }), 'folder:ab12cd34');
    assert.equal(getDraftKey({ folderKey: 'ab12cd34', showUrl: 'demo.json', showId: 'demo' }), 'folder:ab12cd34');
  });

  test('returns url:path when showUrl is present and no folderKey', () => {
    assert.equal(getDraftKey({ showUrl: '../shows/demo/show.json' }), 'url:../shows/demo/show.json');
    assert.equal(getDraftKey({ showUrl: '../shows/demo/show.json', showId: 'demo' }), 'url:../shows/demo/show.json');
  });

  test('returns id:showId when neither folderKey nor showUrl is present', () => {
    assert.equal(getDraftKey({ showId: 'my-talk' }), 'id:my-talk');
  });

  test('returns fallback for empty target', () => {
    assert.equal(getDraftKey(), 'draft:default');
    assert.equal(getDraftKey({}), 'draft:default');
  });
});

describe('formatDraftTime (I-020)', () => {
  test('returns fallback on invalid or missing timestamp', () => {
    assert.equal(formatDraftTime(null), 'a previous session');
    assert.equal(formatDraftTime(undefined), 'a previous session');
    assert.equal(formatDraftTime(NaN), 'a previous session');
  });

  test('formats timestamp from today', () => {
    const today = new Date();
    today.setHours(14, 25, 0, 0);
    assert.equal(formatDraftTime(today.getTime()), 'today at 14:25');
  });

  test('formats timestamp from yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 5, 0, 0);
    assert.equal(formatDraftTime(yesterday.getTime()), 'yesterday at 09:05');
  });

  test('formats timestamp from an earlier date', () => {
    const past = new Date(2025, 5, 15, 10, 30); // 15 Jun 2025 10:30
    const str = formatDraftTime(past.getTime());
    assert.match(str, /15 Jun.*at 10:30/);
  });
});

describe('DraftStore memory adapter (I-020)', () => {
  test('saveDraft, getDraft, and deleteDraft round-trip', async () => {
    const store = new DraftStore(memoryAdapter());
    assert.equal(await store.getDraft('folder:123'), null);

    const testShow = { id: 'demo', meta: { title: 'Demo Talk' }, slides: [] };
    await store.saveDraft('folder:123', testShow, { folderKey: '123' });

    const draft = await store.getDraft('folder:123');
    assert.ok(draft);
    assert.equal(draft.key, 'folder:123');
    assert.equal(draft.showId, 'demo');
    assert.equal(draft.title, 'Demo Talk');
    assert.equal(draft.folderKey, '123');
    assert.deepEqual(draft.show, testShow);
    assert.ok(typeof draft.updatedAt === 'number');

    await store.deleteDraft('folder:123');
    assert.equal(await store.getDraft('folder:123'), null);
  });

  test('listDrafts returns drafts ordered by updatedAt descending', async () => {
    const store = new DraftStore(memoryAdapter());
    await store.saveDraft('k1', { id: 's1', meta: { title: 'First' } });
    // Ensure time difference
    await new Promise((r) => setTimeout(r, 10));
    await store.saveDraft('k2', { id: 's2', meta: { title: 'Second' } });

    const drafts = await store.listDrafts();
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].key, 'k2');
    assert.equal(drafts[1].key, 'k1');

    await store.clear();
    assert.deepEqual(await store.listDrafts(), []);
  });
});

describe('DraftStore localStorage adapter (I-020)', () => {
  test('functions with mocked localStorage', async () => {
    const mockStorage = new Map();
    // @ts-ignore
    globalThis.localStorage = {
      getItem: (k) => mockStorage.get(k) ?? null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      get length() { return mockStorage.size; },
      key: (i) => Array.from(mockStorage.keys())[i] ?? null,
      clear: () => mockStorage.clear(),
    };

    try {
      const adapter = localStorageAdapter('test-draft:');
      assert.ok(adapter);
      const store = new DraftStore(adapter);

      await store.saveDraft('f1', { id: 'd1', meta: { title: 'Local Test' } });
      const record = await store.getDraft('f1');
      assert.equal(record?.title, 'Local Test');

      const all = await store.listDrafts();
      assert.equal(all.length, 1);
      assert.equal(all[0].key, 'f1');

      await store.deleteDraft('f1');
      assert.equal(await store.getDraft('f1'), null);
    } finally {
      // @ts-ignore
      delete globalThis.localStorage;
    }
  });
});

describe('restoreDraft action and store integration (I-020)', () => {
  test('restoreDraft returns a deep clone of the draft show', () => {
    const current = clone(demo);
    const draftShow = clone(demo);
    draftShow.meta.title = 'Recovered Title';

    const next = restoreDraft(current, draftShow);
    assert.equal(next.meta.title, 'Recovered Title');
    assert.notEqual(next, draftShow, 'must be a new cloned object');
  });

  test('store.restoreDraft sets show, marks dirty, and enables undo', () => {
    const store = createStore(demo, { template });
    assert.equal(store.state.dirty, false);
    assert.equal(store.state.canUndo, false);

    const draftShow = clone(demo);
    draftShow.slides[0].content.title = 'Restored From Crash';

    store.restoreDraft(draftShow);
    assert.equal(store.state.show.slides[0].content.title, 'Restored From Crash');
    assert.equal(store.state.dirty, true, 'restored draft is dirty until saved to disk');
    assert.equal(store.state.canUndo, true, 'previous disk show is in undo stack');

    // Undo reverts back to initial show
    assert.equal(store.undo(), true);
    assert.equal(store.state.show.slides[0].content.title, demo.slides[0].content.title);

    // Redo brings back draft
    assert.equal(store.redo(), true);
    assert.equal(store.state.show.slides[0].content.title, 'Restored From Crash');
  });
});

describe('startAutosave controller (I-020)', () => {
  test('periodically saves when dirty, and cleans up draft on clean save', async () => {
    const draftStore = new DraftStore(memoryAdapter());
    const store = createStore(demo, { template });
    const draftKey = 'folder:autosave-test';

    const watcher = startAutosave(store, {
      draftKey,
      draftStore,
      intervalMs: 20, // 20ms for fast unit test
    });

    try {
      // 1. Initial clean state: nothing is saved
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(await draftStore.getDraft(draftKey), null);

      // 2. Make an edit: store becomes dirty
      store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'New Autosaved Title' });
      assert.equal(store.state.dirty, true);

      // Wait for timer tick
      await new Promise((r) => setTimeout(r, 60));
      const draft = await draftStore.getDraft(draftKey);
      assert.ok(draft, 'draft should be autosaved');
      assert.equal(draft.show.slides[0].content.title, 'New Autosaved Title');

      // 3. Save to disk: store becomes clean
      store.markSaved(store.state.show);
      assert.equal(store.state.dirty, false);

      // Subscriber should have cleared the draft
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(await draftStore.getDraft(draftKey), null, 'draft should be deleted on save');
    } finally {
      watcher.stop();
    }
  });

  test('flush immediately persists pending dirty changes', async () => {
    const draftStore = new DraftStore(memoryAdapter());
    const store = createStore(demo, { template });
    const draftKey = 'folder:flush-test';

    const watcher = startAutosave(store, {
      draftKey,
      draftStore,
      intervalMs: 10000, // long interval
    });

    try {
      store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'Flush Me' });
      // Should not be saved immediately by timer
      assert.equal(await draftStore.getDraft(draftKey), null);

      // Calling flush persists it
      await watcher.flush();
      const draft = await draftStore.getDraft(draftKey);
      assert.ok(draft);
      assert.equal(draft.show.slides[0].content.title, 'Flush Me');
    } finally {
      watcher.stop();
    }
  });
});
