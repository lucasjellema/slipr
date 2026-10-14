import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_KEY, savedCollapsed } from '../js/sidebar.js';

/** @param {Record<string, string>} [data] */
const fakeStorage = (data = {}) => ({
  getItem: (/** @type {string} */ k) => (k in data ? data[k] : null),
  setItem: (/** @type {string} */ k, /** @type {string} */ v) => { data[k] = v; },
});

describe('collapsible slide list (I-101)', () => {
  test('the saved state: collapsed only when stored so', () => {
    assert.equal(savedCollapsed(fakeStorage({ [SIDEBAR_KEY]: 'collapsed' })), true);
    assert.equal(savedCollapsed(fakeStorage({ [SIDEBAR_KEY]: 'expanded' })), false);
    assert.equal(savedCollapsed(fakeStorage()), false, 'first visit: expanded');
    assert.equal(savedCollapsed(null), false, 'no storage');
    assert.equal(savedCollapsed({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} }), false, 'blocked storage');
  });
});
