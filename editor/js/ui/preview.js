// @ts-check
/**
 * Editor live preview pane: renders the selected slide in Audience or Reader mode,
 * with profile and depth simulation, responsive scaling, and validation diagnostics.
 */

import { h } from '../dom.js';
import { issuesForSlide } from '../store.js';
import { renderSlide, slideTitle } from '../../../shared/render.js';
import { renderBlocks } from '../../../shared/blocks.js';
import { hydrateEmbeds } from '../../../shared/embeds/index.js';
import { readShowFile } from '../io/show-files.js';
import { blockVisible, personalize } from '../../../viewer/reader/personalize.js';
import { mountOverlayEditor, onOverlaySelection } from './overlay-editor.js';

/** Shortcut that opens and closes the enlarged preview (I-103). */
export const ENLARGE_SHORTCUT = 'Ctrl+Shift+E';

/**
 * Mount the live preview pane into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 * @param {{ onEnlarge?: () => void, enlarged?: { onClose: () => void } }} [options]
 *   onEnlarge: shows the ⤢ Enlarge button. enlarged: the pane inside the enlarged
 *   preview dialog (I-103), with slide navigation and a close button instead.
 * @returns {{ destroy: () => void }}
 */
export function mountPreview(container, store, options = {}) {
  const { onEnlarge, enlarged } = options;
  const root = h('div', { class: 'slipr-preview-pane' });
  container.append(root);

  let debounceTimer = null;

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  function render() {
    // An extra image's box had keyboard focus: give it back after the re-render (I-083).
    const overlayFocused = Boolean(document.activeElement?.closest?.('.slipr-overlay-box') && root.contains(document.activeElement));
    root.innerHTML = '';
    const state = store.state;
    const slide = state.show?.slides?.find((s) => s.id === state.selectedSlideId);

    // 1. Controls bar
    const modeGroup = h('div', { class: 'slipr-preview-mode-switch' }, [
      h(
        'button',
        {
          class: `slipr-btn slipr-btn-sm ${state.previewMode === 'audience' ? 'is-active' : ''}`,
          onclick: () => store.setPreviewMode('audience'),
        },
        ['Audience']
      ),
      h(
        'button',
        {
          class: `slipr-btn slipr-btn-sm ${state.previewMode === 'reader' ? 'is-active' : ''}`,
          onclick: () => store.setPreviewMode('reader'),
        },
        ['Reader']
      ),
    ]);

    const simControls = [];
    if (state.previewMode === 'reader') {
      const profiles = state.show?.profiles ?? [];
      const profileOptions = [
        h('option', { value: '' }, ['All profiles']),
        ...profiles.map((p) =>
          h('option', { value: p.id, selected: p.id === state.previewProfile ? true : undefined }, [p.label])
        ),
      ];

      simControls.push(
        h(
          'select',
          {
            class: 'slipr-select slipr-select-sm',
            title: 'Reader profile',
            onchange: (e) => {
              const val = /** @type {HTMLSelectElement} */ (e.target).value;
              store.setPreviewProfile(val || null);
            },
          },
          profileOptions
        )
      );

      simControls.push(
        h(
          'select',
          {
            class: 'slipr-select slipr-select-sm',
            title: 'Reader depth',
            onchange: (e) => {
              const d = Number(/** @type {HTMLSelectElement} */ (e.target).value);
              store.setPreviewDepth(d);
            },
          },
          [
            h('option', { value: '1', selected: state.previewDepth === 1 ? true : undefined }, ['Depth 1 (Essential)']),
            h('option', { value: '2', selected: state.previewDepth === 2 ? true : undefined }, ['Depth 2 (Standard)']),
            h('option', { value: '3', selected: state.previewDepth === 3 ? true : undefined }, ['Depth 3 (Deep dive)']),
          ]
        )
      );
    }

    const header = h('div', { class: 'slipr-preview-header' }, [
      enlarged ? slideNavigation(store) : null,
      modeGroup,
      h('div', { class: 'slipr-preview-sim-controls' }, simControls),
      enlarged
        ? h('button', {
            type: 'button',
            class: 'slipr-btn slipr-btn-sm slipr-preview-close',
            title: `Close the enlarged preview (Esc or ${ENLARGE_SHORTCUT})`,
            'aria-label': 'Close the enlarged preview',
            onclick: () => enlarged.onClose(),
          }, ['✕'])
        : onEnlarge
          ? h('button', {
              type: 'button',
              class: 'slipr-btn slipr-btn-sm slipr-btn-icon slipr-preview-enlarge',
              title: `Enlarge the preview to almost the whole window, to place and edit things on the slide (${ENLARGE_SHORTCUT})`,
              'aria-label': 'Enlarge the preview',
              'aria-haspopup': 'dialog',
              onclick: () => onEnlarge(),
            }, [h('span', { 'aria-hidden': 'true' }, ['⤢'])])
          : null,
    ]);

    // 2. Viewport
    const viewport = h('div', { class: `slipr-preview-viewport is-${state.previewMode}` });

    if (!slide) {
      viewport.append(h('div', { class: 'slipr-preview-empty' }, ['No slide selected']));
    } else {
      const showContext = {
        show: state.show,
        template: state.template,
        layouts: state.layouts,
        validation: state.validation,
        resolveAsset: state.resolveAsset,
        resolveTemplateAsset: state.resolveTemplateAsset,
      };

      // Say so when the viewer would not show this slide in the normal way.
      const notice = state.previewMode === 'audience'
        ? (slide.audience?.hidden ? 'Backup slide: hidden from the audience sequence. Audience mode shows it after the last slide, unnumbered.' : null)
        : (slide.reader?.hidden ? 'Hidden from reader mode: readers never see this slide. The preview shows it anyway.' : null);
      if (notice) viewport.append(h('div', { class: 'slipr-preview-notice', role: 'note' }, [notice]));

      if (state.previewMode === 'audience') {
        const slideEl = renderSlide(slide, showContext, { mode: 'audience' });
        const scaler = h('div', { class: 'slipr-preview-scaler' }, [slideEl]);
        viewport.append(scaler);
        mountOverlayEditor(slideEl, slide, store, { focus: overlayFocused });
      } else {
        // Reader mode preview: slide visual + tailored reader layer
        const readerContainer = h('div', { class: 'slipr-reader-preview-content' });
        // Like the viewer: no slide visual when reader.showSlide is false (a reader-only text page).
        if (slide.reader?.showSlide !== false) {
          readerContainer.append(renderSlide(slide, showContext, { mode: 'reader' }));
        }

        // Filter visible blocks using personalize
        const personalizedModel = personalize(state.show, {
          profile: state.previewProfile,
          depth: /** @type {1|2|3} */ (state.previewDepth),
        });
        const visibleSlide = personalizedModel.slides.find((s) => s.slide.id === slide.id);
        // A slide personalize() leaves out (reader-hidden): filter its blocks by the same rule.
        const blocksToRender = visibleSlide
          ? visibleSlide.blocks
          : (slide.reader?.blocks ?? []).filter((/** @type {any} */ b) => blockVisible(b, personalizedModel.prefs));

        if (slide.reader?.summary) {
          const summaryEl = h('div', { class: 'slipr-reader-summary' }, [slide.reader.summary]);
          readerContainer.append(summaryEl);
        }

        if (blocksToRender.length > 0) {
          const blocksHtml = renderBlocks(blocksToRender, slide.id, {
            show: state.show,
            resolveAsset: state.resolveAsset,
          });
          const blocksEl = h('div', { class: 'slipr-reader-blocks' });
          blocksEl.innerHTML = blocksHtml; // safe: produced by renderBlocks (escape + markdown)
          readerContainer.append(blocksEl);
        }

        viewport.append(readerContainer);
      }
    }

    // 3. Diagnostics & Warnings
    const slideIndex = state.show?.slides?.findIndex((s) => s.id === slide?.id) ?? -1;
    const { errors: slideErrors, warnings: slideWarnings } = issuesForSlide(state.validation, slideIndex);

    const diagnostics = h('div', { class: 'slipr-preview-diagnostics' });
    if (slideErrors.length > 0) {
      diagnostics.append(
        h('div', { class: 'slipr-warning-pill slipr-error-pill', role: 'alert' }, [
          `✖ ${slideErrors.length} error${slideErrors.length > 1 ? 's' : ''}: ${slideErrors[0].message}`,
        ])
      );
    }
    if (slideWarnings.length > 0) {
      diagnostics.append(
        h('div', { class: 'slipr-warning-pill' }, [
          `⚠ ${slideWarnings.length} warning${slideWarnings.length > 1 ? 's' : ''}: ${slideWarnings[0].message}`,
        ])
      );
    }

    root.append(header, viewport, diagnostics);
    // Map tiles in the show folder are read like the show's other files (I-099).
    hydrateEmbeds(viewport, { readAsset: (path) => readShowFile(store.state, path) });
  }

  const stopSelection = onOverlaySelection(scheduleRender);

  const unsubscribe = store.subscribe(({ changedKeys }) => {
    if (
      changedKeys.includes('show') ||
      changedKeys.includes('selectedSlideId') ||
      changedKeys.includes('previewMode') ||
      changedKeys.includes('previewProfile') ||
      changedKeys.includes('previewDepth') ||
      changedKeys.includes('template')
    ) {
      scheduleRender();
    }
  });

  render();

  return {
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      stopSelection();
      unsubscribe();
      root.remove();
    },
  };
}

/**
 * ‹ 3 / 20: title › for the enlarged preview (I-103). PageUp / PageDown do the
 * same (global shortcuts).
 * @param {import('../store.js').EditorStore} store
 */
function slideNavigation(store) {
  const slides = store.state.show?.slides ?? [];
  const index = slides.findIndex((/** @type {any} */ s) => s.id === store.state.selectedSlideId);
  const slide = slides[index];
  const go = (/** @type {number} */ step) => {
    const next = slides[index + step];
    if (next) store.selectSlide(next.id);
  };
  const title = slide ? slideTitle(slide) || `Slide ${index + 1}` : '';
  return h('div', { class: 'slipr-preview-nav', role: 'group', 'aria-label': 'Slide' }, [
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-icon', title: 'Previous slide (PageUp)', 'aria-label': 'Previous slide',
      disabled: index <= 0 ? true : undefined, onclick: () => go(-1),
    }, ['‹']),
    h('span', { class: 'slipr-preview-nav-label', title, 'aria-live': 'polite' }, [
      h('span', { class: 'slipr-preview-nav-number' }, [`${index + 1} / ${slides.length}`]),
      title ? ` ${title}` : '',
    ]),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-icon', title: 'Next slide (PageDown)', 'aria-label': 'Next slide',
      disabled: index < 0 || index >= slides.length - 1 ? true : undefined, onclick: () => go(1),
    }, ['›']),
  ]);
}

