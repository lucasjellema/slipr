// @ts-check
/**
 * Editor reader tab: summary, reader blocks management,
 * profile/depth controls, related slides, and reader visibility.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { addImageToBlock } from '../image-input.js';
import { imageValue } from '../slot-values.js';
import { imageField, runImage } from './image-field.js';
import { hotspotEditor } from './hotspot-editor.js';

/** Actions the reader form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['setSummary', 'updateBlock', 'updateHotspot']);

const BLOCK_TYPES = [
  { type: 'text', label: 'Text (Markdown)' },
  { type: 'details', label: 'Collapsible Panel' },
  { type: 'callout', label: 'Callout Box' },
  { type: 'tabs', label: 'Tabs' },
  { type: 'image', label: 'Image with Hotspots' },
  { type: 'embed', label: 'Embedded Page' },
  { type: 'slide-ref', label: 'Link to Slide' },
];

const CALLOUT_VARIANTS = [
  { value: 'info', label: 'Info' },
  { value: 'tip', label: 'Tip' },
  { value: 'warning', label: 'Warning' },
  { value: 'quote', label: 'Quote' },
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
            // setBlockType converts the block to a valid shape for the new type.
            const newType = /** @type {HTMLSelectElement} */ (e.target).value;
            store.dispatch('setBlockType', { slideId: slide.id, blockId: block.id, type: newType });
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
        const variant = block.variant ?? 'info';
        const kindSelect = h(
          'select',
          {
            class: 'slipr-select slipr-select-sm',
            'aria-label': 'Callout kind',
            onchange: (e) => {
              const val = /** @type {HTMLSelectElement} */ (e.target).value;
              store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { variant: val } });
            },
          },
          CALLOUT_VARIANTS.map((v) => h('option', { value: v.value, selected: v.value === variant ? true : undefined }, [v.label]))
        );
        const calloutTitle = h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm',
          placeholder: 'Title (optional)',
          value: block.title ?? '',
          oninput: (e) => {
            const val = /** @type {HTMLInputElement} */ (e.target).value;
            store.dispatch('updateBlock', { slideId: slide.id, blockId: block.id, patch: { title: val || undefined } });
          },
        });
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
        bodyEl.append(kindSelect, calloutTitle, mdArea);
      } else if (block.type === 'image') {
        bodyEl.append(imageBlockEditor(store, slide.id, block));
      } else if (block.type !== 'text') {
        // tabs, embed, slide-ref: no editor yet. Read-only, so their shape is never broken.
        bodyEl.append(
          h('div', { class: 'slipr-readonly' }, [describeBlock(block)]),
          h('span', { class: 'slipr-help' }, [`This ${block.type} block can't be edited here yet. Edit show.json directly.`])
        );
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

  store.subscribe((event) => {
    if (event.changedKeys.includes('show') || event.changedKeys.includes('selectedSlideId')) {
      // Leave the form alone while it echoes the user's own typing; re-render for anything else.
      if (isTypingEcho(root, event, TYPING_ACTIONS)) return;
      rerenderKeepingFocus(root, render);
    }
  });

  render();
}

/**
 * Editor for a reader image block: the image (choose, drop or paste), alt
 * text, caption, and the hotspot editor (E-006).
 * @param {import('../store.js').EditorStore} store
 * @param {string} slideId
 * @param {any} block
 */
function imageBlockEditor(store, slideId, block) {
  const update = (/** @type {Record<string, any>} */ patch) =>
    store.dispatch('updateBlock', { slideId, blockId: block.id, patch });
  return h('div', { class: 'slipr-image-block' }, [
    imageField({
      label: 'Reader image',
      image: block.image,
      resolveAsset: store.state.resolveAsset,
      onFile: (file) => runImage(() => addImageToBlock(store, { slideId, blockId: block.id, file })),
    }),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Alt text: what the image shows',
      'aria-label': 'Reader image: alt text',
      value: block.image?.alt ?? '',
      disabled: block.image?.src ? undefined : true,
      oninput: (/** @type {Event} */ e) => {
        if (!block.image?.src) return;
        const current = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)
          ?.reader?.blocks?.find((/** @type {any} */ b) => b.id === block.id)?.image;
        update({ image: imageValue(current, { alt: /** @type {HTMLInputElement} */ (e.target).value }) });
      },
    }),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Caption (optional)',
      'aria-label': 'Reader image: caption',
      value: block.caption ?? '',
      oninput: (/** @type {Event} */ e) => update({ caption: /** @type {HTMLInputElement} */ (e.target).value || undefined }),
    }),
    block.image?.src
      ? hotspotEditor({ store, slideId, block })
      : h('p', { class: 'slipr-help' }, ['Add an image first; then you can place hotspots on it.']),
  ]);
}

/**
 * One-line summary of a block without an editor.
 * @param {any} block
 * @returns {string}
 */
function describeBlock(block) {
  if (block.type === 'tabs') return `${block.tabs?.length ?? 0} tab(s): ${(block.tabs ?? []).map((/** @type {any} */ t) => t.label).join(', ')}`;
  if (block.type === 'embed') return `${block.title || 'Embedded page'}: ${block.url || '(no URL yet)'}`;
  if (block.type === 'slide-ref') return `Link to slide ${block.slide || '(none)'}${block.label ? `: ${block.label}` : ''}`;
  return block.type;
}
