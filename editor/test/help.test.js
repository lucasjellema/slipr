import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GRAPH_HELP, HELP_SECTIONS, helpUrl } from '../js/help.js';

const html = await readFile(new URL('../help.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

describe('user manual (E-016)', () => {
  test('helpUrl goes to the section for the current tab', () => {
    assert.equal(helpUrl('slide'), 'help.html#slide-tab');
    assert.equal(helpUrl('reader'), 'help.html#reader-tab');
    assert.equal(helpUrl('settings'), 'help.html#settings');
    assert.equal(helpUrl(), 'help.html');
    assert.equal(helpUrl('unknown'), 'help.html');
  });

  test('every tab section exists in help.html', () => {
    for (const id of Object.values(HELP_SECTIONS)) assert.ok(ids.has(id), `help.html has no id="${id}"`);
    assert.ok(ids.has(GRAPH_HELP.split('#')[1]), 'the graph fields link to an existing section');
  });

  test('every link inside help.html points to an existing section', () => {
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(targets.length > 10);
    for (const t of targets) assert.ok(ids.has(t), `help.html links to #${t}, which does not exist`);
  });

  test('every link from the README into help.html points to an existing section', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const targets = [...readme.matchAll(/help\.html#([\w-]+)/g)].map((m) => m[1]);
    assert.ok(targets.length > 5);
    for (const t of targets) assert.ok(ids.has(t), `README links to help.html#${t}, which does not exist`);
  });

  test('help.html loads nothing from the network', () => {
    assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
  });
});
