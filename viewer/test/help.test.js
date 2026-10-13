import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HELP_SECTIONS, helpUrl } from '../js/help.js';

const html = await readFile(new URL('../help.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

describe('Viewer user manual (V-019)', () => {
  test('helpUrl returns default or target anchor', () => {
    assert.equal(helpUrl(), 'help.html');
    assert.equal(helpUrl('concept'), 'help.html#concept');
    assert.equal(helpUrl('remote'), 'help.html#remote');
    assert.equal(helpUrl('reader'), 'help.html#reader');
    assert.equal(helpUrl('shortcuts'), 'help.html#shortcuts');
    assert.equal(helpUrl('custom-id'), 'help.html#custom-id');
  });

  test('every section in HELP_SECTIONS exists in viewer/help.html', () => {
    for (const [key, id] of Object.entries(HELP_SECTIONS)) {
      assert.ok(ids.has(id), `viewer/help.html is missing id="${id}" for section key "${key}"`);
    }
  });

  test('every internal link in viewer/help.html points to an existing section id', () => {
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(targets.length > 5, 'expected several internal links');
    for (const t of targets) {
      assert.ok(ids.has(t), `viewer/help.html links to #${t}, which does not exist`);
    }
  });

  test('viewer/help.html is completely offline and loads nothing from the network', () => {
    assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
  });

  test('every link from viewer/README.md into help.html points to an existing section', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const targets = [...readme.matchAll(/help\.html#([\w-]+)/g)].map((m) => m[1]);
    assert.ok(targets.length >= 5, 'expected several links into help.html');
    for (const t of targets) {
      assert.ok(ids.has(t), `README links to help.html#${t}, which does not exist`);
    }
  });

  test('contains phone remote section with personal hotspot firewall solutions', () => {
    assert.ok(html.includes('id="remote"'));
    assert.ok(html.includes('Personal Hotspot') || html.includes('personal hotspot'));
    // Solution 1: Private network profile
    assert.ok(html.includes('Private network'));
    assert.ok(html.includes('Set-NetConnectionProfile'));
    // Solution 2: Windows Defender Firewall
    assert.ok(html.includes('Windows Defender Firewall') || html.includes('Windows Firewall'));
    assert.ok(html.includes('Node.js: Server-side JavaScript'));
  });
});
