import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { createStore } from '../js/store.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('editor store', () => {
  test('initial state and subscription', () => {
    const store = createStore(demo, { template });
    assert.equal(store.state.show, demo);
    assert.equal(store.state.dirty, false);
    assert.equal(store.state.canUndo, false);
    assert.equal(store.state.canRedo, false);
    assert.ok(store.state.validation.ok);

    let notification = null;
    const unsubscribe = store.subscribe((evt) => {
      notification = evt;
    });

    store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'Updated' });
    assert.ok(notification);
    assert.ok(notification.changedKeys.includes('show'));
    assert.equal(store.state.dirty, true);
    assert.equal(store.state.canUndo, true);

    unsubscribe();
    store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'Again' });
    assert.equal(notification.action.payload.value, 'Updated', 'subscriber should be detached');
  });

  test('undo and redo', () => {
    const store = createStore(demo, { template });
    const originalTitle = demo.slides[0].content.title;

    store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'V1' });
    store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'V2' });

    assert.equal(store.state.show.slides[0].content.title, 'V2');
    assert.equal(store.state.canUndo, true);
    assert.equal(store.state.canRedo, false);

    assert.equal(store.undo(), true);
    assert.equal(store.state.show.slides[0].content.title, 'V1');
    assert.equal(store.state.canRedo, true);

    assert.equal(store.undo(), true);
    assert.equal(store.state.show.slides[0].content.title, originalTitle);
    assert.equal(store.state.canUndo, false);

    assert.equal(store.redo(), true);
    assert.equal(store.state.show.slides[0].content.title, 'V1');

    assert.equal(store.redo(), true);
    assert.equal(store.state.show.slides[0].content.title, 'V2');
    assert.equal(store.state.canRedo, false);
  });

  test('typing coalescing into single undo entry', () => {
    const store = createStore(demo, { template });
    const slideId = 's-title';
    const originalTitle = demo.slides[0].content.title;

    // Simulate typing: 3 rapid keystrokes with coalesceKey
    store.dispatch('setSlot', { slideId, slot: 'title', value: 'H' }, { coalesceKey: 'field-title' });
    store.dispatch('setSlot', { slideId, slot: 'title', value: 'He' }, { coalesceKey: 'field-title' });
    store.dispatch('setSlot', { slideId, slot: 'title', value: 'Hey' }, { coalesceKey: 'field-title' });

    assert.equal(store.state.show.slides[0].content.title, 'Hey');

    // A single undo should revert back to originalTitle!
    assert.equal(store.undo(), true);
    assert.equal(store.state.show.slides[0].content.title, originalTitle);
    assert.equal(store.state.canUndo, false);
  });

  test('deleting selected slide updates selection to existing slide', () => {
    const store = createStore(demo, { template });
    store.selectSlide('s-title');
    assert.equal(store.state.selectedSlideId, 's-title');

    store.dispatch('deleteSlide', { slideId: 's-title' });
    assert.notEqual(store.state.selectedSlideId, 's-title');
    assert.equal(store.state.selectedSlideId, store.state.show.slides[0].id);
  });

  test('markClean resets dirty flag', () => {
    const store = createStore(demo, { template });
    store.dispatch('setSlot', { slideId: 's-title', slot: 'title', value: 'Dirty' });
    assert.equal(store.state.dirty, true);

    store.markClean();
    assert.equal(store.state.dirty, false);
  });

  test('UI state controls', () => {
    const store = createStore(demo, { template });

    store.setActiveTab('reader');
    assert.equal(store.state.activeTab, 'reader');

    store.setPreviewMode('reader');
    assert.equal(store.state.previewMode, 'reader');

    store.setPreviewProfile('dev');
    assert.equal(store.state.previewProfile, 'dev');

    store.setPreviewDepth(3);
    assert.equal(store.state.previewDepth, 3);
  });
});
