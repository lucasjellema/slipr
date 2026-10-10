// @ts-check
/**
 * Editor reader tab: summary, reader blocks management,
 * profile/depth controls, related slides, and reader visibility.
 */

import { h } from '../dom.js';

const BLOCK_TYPES = [
  { type: 'text', label: 'Text (Markdown)' },
  { type: 'details', label: 'Collapsible Panel' },
  { type: 'callout', label: 'Callout Box' },
  { type: 'tabs', label: 'Tabs' },
  { type: 'image', label: 'Image with Hotspots' },
  { type: 'slide-ref', label: 'Link to Slide' },
];

/**
 * Mount the reader layer form into a container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountReaderForm(container, store) {
  const root = h('div', { class: 'slipr-reader-form' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const slide = state.show?.slides?.find((s) => s.id === state.selectedSlideId);

    if (!slide) {
      root.append(h('div', { class: 'slipr-empty-state' }, ['Select a slide to edit reader layer']));
      return;
    }

    const reader = slide.reader ?? {};
    const blocks = Array.isArray(reader.blocks) ? reader.blocks : [];
    const profiles = state.show?.profiles ?? [];

    // 1. Reader Summary
    const summaryRow = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Reader Summary']),
      h(
        'textarea',
        {
          class: 'slipr-textarea slipr-textarea-sm',
          placeholder: 'A concise summary shown at the top of the reader view…',
          oninput: (e) => {
            const summary = /** @type {HTMLTextAreaElement} */ (e.target).value;
            store.dispatch('setSummary', { slideId: slide.id, summary }, {
              coalesceKey: `summary-${slide.id}`,
            });
          },
        },
        [reader.summary ?? '']
      ),
    ]);

    // 2. Reader Blocks Header
    const blocksHeader = h('div', { class: 'slipr-blocks-header' }, [
      h('h3', { class: 'slipr-subheading' }, [`Reader Blocks (${blocks.length})`]),
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-sm',
          onclick: () => {
            store.dispatch('addBlock', {
              slideId: slide.id,
              block: { type: 'text', md: '' },
            });
          },
        },
        ['+ Add Block']
      ),
    ]);

    // 3. Blocks List
    const blocksList = h('div', { class: 'slipr-blocks-list' });

    blocks.forEach((block, idx) => {
      const blockCard = h('div', { class: 'slipr-block-card' });

      // Block header
      const typeSelect = h(
        'select',
        {
          class: 'slipr-select slipr-select-sm',
          onchange: (e) => {
            const newType = /** @type {HTMLSelectElement} */ (e.target).value;
            store.dispatch('updateBlock', {
              slideId: slide.id,
              blockId: block.id,
              patch: { type: newType },
            });
          },
        },
        BLOCK_TYPES.map((bt) =>
          h('option', { value: bt.type, selected: bt.type === block.type ? true : undefined }, [bt.label])
        )
      );

      const depthSelect = h(
        'select',
        {
          class: 'slipr-select slipr-select-sm',
          title: 'Detail level',
          onchange: (e) => {
            const d = Number(/** @type {HTMLSelectElement} */ (e.target).value);
            store.dispatch('setBlockAudience', {
              slideId: slide.id,
              blockId: block.id,
              depth: d,
            });
          },
        },
        [
          h('option', { value: '1', selected: block.depth === 1 ? true : undefined }, ['Essential (1)']),
          h('option', { value: '2', selected: !block.depth || block.depth === 2 ? true : undefined }, ['Standard (2)']),
          h('option', { value: '3', selected: block.depth === 3 ? true : undefined }, ['Deep dive (3)']),
        ]
      );

      const tools = h('div', { class: 'slipr-block-tools' }, [
        h(
          'button',
          {
            class: 'slipr-item-btn',
            disabled: idx === 0,
            title: 'Move up',
            onclick: () => store.dispatch('moveBlock', { slideId: slide.id, blockId: block.id, toIndex: idx - 1 }),
          },
          ['▲']
        ),
        h(
          'button',
          {
            class: 'slipr-item-btn',
            disabled: idx === blocks.length - 1,
            title: 'Move down',
            onclick: () => store.dispatch('moveBlock', { slideId: slide.id, blockId: block.id, toIndex: idx + 1 }),
          },
          ['▼']
        ),
        h(
          'button',
          {
            class: 'slipr-item-btn slipr-item-btn-danger',
            title: 'Delete block',
            onclick: () => store.dispatch('deleteBlock', { slideId: slide.id, blockId: block.id }),
          },
          ['🗑']
        ),
      ]);

      const topRow = h('div', { class: 'slipr-block-header' }, [
        typeSelect,
        depthSelect,
        tools,
      ]);

      // Block content editor
      const bodyEl = h('div', { class: 'slipr-block-body' });

      if (block.type === 'details') {
        const titleInput = h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm',
          placeholder: 'Panel title…',
          value: block.title ?? '',
          oninput: (e) => {
            const val = /** @type {HTMLInputElement} */ (e.target).value;
            store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { title: val } });
          },
        });
        const mdArea = h(
          'textarea',
          {
            class: 'slipr-textarea slipr-textarea-sm',
            placeholder: 'Markdown content…',
            oninput: (e) => {
              const val = /** @type {HTMLTextAreaElement} */ (e.target).value;
              store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { md: val } });
            },
          },
          [block.md ?? '']
        );
        bodyEl.append(titleInput, mdArea);
      } else if (block.type === 'callout') {
        const kindSelect = h(
          'select',
          {
            class: 'slipr-select slipr-select-sm',
            onchange: (e) => {
              const val = /** @type {HTMLSelectElement} */ (e.target).value;
              store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { kind: val } });
            },
          },
          [
            h('option', { value: 'note', selected: block.kind === 'note' ? true : undefined }, ['Note']),
            h('option', { value: 'warning', selected: block.kind === 'warning' ? true : undefined }, ['Warning']),
            h('option', { value: 'tip', selected: block.kind === 'tip' ? true : undefined }, ['Tip']),
          ]
        );
        const mdArea = h(
          'textarea',
          {
            class: 'slipr-textarea slipr-textarea-sm',
            placeholder: 'Callout message…',
            oninput: (e) => {
              const val = /** @type {HTMLTextAreaElement} */ (e.target).value;
              store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { md: val } });
            },
          },
          [block.md ?? '']
        );
        bodyEl.append(kindSelect, mdArea);
      } else {
        // Default text markdown editor
        const mdArea = h(
          'textarea',
          {
            class: 'slipr-textarea',
            placeholder: 'Write interactive reader text in Markdown…',
            oninput: (e) => {
              const val = /** @type {HTMLTextAreaElement} */ (e.target).value;
              store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { md: val } });
            },
          },
          [block.md ?? '']
        );
        bodyEl.append(mdArea);
      }

      blockCard.append(topRow, bodyEl);
      blocksList.append(blockCard);
    });

    // 4. Reader Visibility
    const hiddenCheckbox = h('input', {
      type: 'checkbox',
      checked: Boolean(slide.reader?.hidden),
      onchange: (e) => {
        const checked = /** @type {HTMLInputElement} */ (e.target).checked;
        store.dispatch('setHidden', { slideId: slide.id, readerHidden: checked });
      },
    });

    const visibilityRow = h('div', { class: 'slipr-form-checkbox' }, [
      h('label', {}, [hiddenCheckbox, ' Hide this slide completely from reader mode']),
    ]);

    root.append(summaryRow, blocksHeader, blocksList, visibilityRow);
  }

  store.subscribe(({ changedKeys }) => {
    if (changedKeys.includes('show') || changedKeys.includes('selectedSlideId')) {
      if (document.activeElement && root.contains(document.activeElement)) {
        return;
      }
      render();
    }
  });

  render();
}
