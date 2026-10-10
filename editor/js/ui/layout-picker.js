// @ts-check
/**
 * Layout picker (E-004): a grid of the template's layouts, each previewed with
 * the shared renderer. Changing a slide's layout previews the slide's own
 * content in every layout and says what would be hidden, brought back or still
 * needed. Adding a slide previews each layout with sample text.
 * Arrow keys move through the grid, Enter chooses, Esc closes.
 */
import { h } from '../dom.js';
import { renderSlide } from '../../../shared/render.js';
import { layoutChangeEffects, layoutName, sampleContent, slideInLayout } from '../layout-choice.js';
import { openDialog } from './dialogs.js';

/**
 * @param {{ store: import('../store.js').EditorStore, mode: 'change' | 'add', slideId: string | null }} options
 *   change: switch the layout of slide `slideId`. add: add a slide after `slideId` (or at the end).
 */
export function openLayoutPicker({ store, mode, slideId }) {
  const state = store.state;
  const layouts = Array.isArray(state.template?.layouts) ? state.template.layouts : [];
  const slide = state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId) ?? null;
  if (mode === 'change' && !slide) return;
  const ctx = {
    show: state.show,
    template: state.template,
    layouts: state.layouts,
    validation: state.validation,
    resolveAsset: state.resolveAsset,
    resolveTemplateAsset: state.resolveTemplateAsset,
  };

  /** @param {any} def */
  const choose = (def) => {
    if (mode === 'change') {
      if (def.id !== slide.layout) {
        store.dispatch('setLayout', { slideId: slide.id, layout: def.id, templateLayouts: state.layouts });
      }
    } else {
      const before = new Set((store.state.show?.slides ?? []).map((/** @type {any} */ s) => s.id));
      store.dispatch('addSlide', { afterSlideId: slideId, layout: def.id });
      const added = (store.state.show?.slides ?? []).find((/** @type {any} */ s) => !before.has(s.id));
      if (added) store.selectSlide(added.id);
    }
  };

  const title = mode === 'change' ? 'Choose a layout for this slide' : 'Add a slide: choose its layout';
  const dialog = openDialog(title, (close) => {
    const cards = layouts.map((/** @type {any} */ def) => {
      const preview = mode === 'change' ? slideInLayout(slide, def.id, layouts) : { id: `preview-${def.id}`, layout: def.id, content: sampleContent(def) };
      let rendered;
      try {
        rendered = renderSlide(preview, ctx, { mode: 'audience' });
      } catch (err) {
        rendered = h('span', { class: 'slipr-layout-thumb-error' }, ['No preview']);
        console.warn(`Slipr: no preview for layout "${def.id}"`, err);
      }
      const current = mode === 'change' && def.id === slide.layout;
      const notes = [];
      if (mode === 'change' && !current) {
        const { hidden, restored, needed } = layoutChangeEffects(slide, preview, layouts);
        if (hidden.length) notes.push(h('span', { class: 'slipr-layout-note is-hidden' }, [`Hides ${hidden.join(', ')} (kept; switch back to restore)`]));
        if (restored.length) notes.push(h('span', { class: 'slipr-layout-note is-restored' }, [`Brings back ${restored.join(', ')}`]));
        if (needed.length) notes.push(h('span', { class: 'slipr-layout-note is-needed' }, [`Needs ${needed.join(', ')}`]));
        if (!hidden.length && !restored.length && !needed.length) notes.push(h('span', { class: 'slipr-layout-note' }, ['Keeps all content']));
      }

      const thumb = h('span', { class: 'slipr-layout-thumb', 'aria-hidden': 'true' }, [rendered]);
      thumb.inert = true; // the rendered slide is a picture here: no links or focus inside
      return h('button', {
        type: 'button',
        class: `slipr-layout-card ${current ? 'is-current' : ''}`,
        'aria-current': current ? 'true' : undefined,
        'data-layout-id': def.id,
        onclick: () => {
          close();
          choose(def);
        },
      }, [
        thumb,
        h('span', { class: 'slipr-layout-name' }, [layoutName(def), current ? ' (current)' : '']),
        def.description ? h('span', { class: 'slipr-layout-description' }, [def.description]) : null,
        ...notes,
      ]);
    });

    const grid = h('div', { class: 'slipr-layout-grid', role: 'group', 'aria-label': 'Layouts' }, cards);
    grid.addEventListener('keydown', (e) => {
      const index = cards.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (index === -1) return;
      // Columns: cards on the same row as the first card.
      const columns = Math.max(1, cards.filter((c) => c.offsetTop === cards[0].offsetTop).length);
      const moves = /** @type {Record<string, number>} */ ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns });
      let next = index;
      if (e.key in moves) next = index + moves[e.key];
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = cards.length - 1;
      else return;
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, next))].focus();
    });

    queueMicrotask(() => {
      const start = cards.find((c) => c.classList.contains('is-current')) ?? cards[0];
      start?.focus();
      start?.scrollIntoView({ block: 'nearest' });
    });

    return [
      h('p', { class: 'slipr-help' }, [
        mode === 'change'
          ? 'Each layout shows this slide\'s content. Content a layout has no place for is kept and comes back when you switch back.'
          : 'The new slide is added after the selected slide.',
      ]),
      grid,
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
      ]),
    ];
  }, { wide: true });
  return dialog;
}
