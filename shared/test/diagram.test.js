import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDiagram, clearDiagramCache, renderDiagrams } from '../diagram.js';
import { validateShow } from '../validate.js';
import { readJson } from './helpers.js';

describe('diagram module', () => {
  test('isDiagram checks object shape', () => {
    assert.equal(isDiagram({ mermaid: 'graph TD; A-->B' }), true);
    assert.equal(isDiagram({ mermaid: 'graph TD; A-->B', caption: 'Flow' }), true);
    assert.equal(isDiagram({ mermaid: 42 }), false);
    assert.equal(isDiagram({ text: 'not a diagram' }), false);
    assert.equal(isDiagram(null), false);
    assert.equal(isDiagram('graph TD'), false);
    assert.equal(isDiagram([]), false);
  });

  test('clearDiagramCache runs safely', () => {
    assert.doesNotThrow(() => clearDiagramCache());
  });

  test('renderDiagrams is safe in non-DOM environments', async () => {
    await assert.doesNotReject(async () => {
      await renderDiagrams(null);
    });
  });

  test('validateShow accepts diagram slots and diagram blocks', () => {
    const template = readJson('templates/default/template.json');
    const show = {
      slipr: '0.1',
      id: 'test-diagram-show',
      meta: { title: 'Diagram test' },
      template: { ref: 'default', version: '^1.0' },
      slides: [
        {
          id: 's-diagram-test',
          layout: 'diagram',
          content: {
            title: 'Architecture overview',
            diagram: {
              mermaid: 'flowchart LR\n  A[Client] --> B[Server]',
              caption: 'Client server architecture',
            },
            caption: 'Main flow',
          },
          reader: {
            summary: 'A diagram test slide',
            blocks: [
              {
                id: 'b-arch',
                type: 'diagram',
                mermaid: 'sequenceDiagram\n  Client->>Server: Request\n  Server-->>Client: Response',
                caption: 'Detailed interaction',
              },
            ],
          },
        },
      ],
    };
    const result = validateShow(show, { template });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });
});
