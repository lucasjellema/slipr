// @ts-check
/**
 * Editor live preview pane: renders the selected slide in Audience or Reader mode,
 * with profile and depth simulation, responsive scaling, and validation diagnostics.
 */

import { h } from '../dom.js';
import { renderSlide } from '../../shared/render.js';
import { renderBlocks } from '../../shared/blocks.js';
import { personalize } from '../../viewer/reader/personalize.js';

/**
 * Mount the live preview pane into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountPreview(container, store) {
  const root = h('div', { class: 'slipr-preview-pane' });
  container.append(root);

  let debounceTimer = null;

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  function render() {
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
      modeGroup,
      h('div', { class: 'slipr-preview-sim-controls' }, simControls),
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

      if (state.previewMode === 'audience') {
        const slideEl = renderSlide(slide, showContext, { mode: 'audience' });
        const scaler = h('div', { class: 'slipr-preview-scaler' }, [slideEl]);
        viewport.append(scaler);
      } else {
        // Reader mode preview: slide visual + tailored reader layer
        const readerContainer = h('div', { class: 'slipr-reader-preview-content' });
        const slideEl = renderSlide(slide, showContext, { mode: 'reader' });
        readerContainer.append(slideEl);

        // Filter visible blocks using personalize
        const personalizedModel = personalize(state.show, {
          profile: state.previewProfile,
          depth: /** @type {1|2|3} */ (state.previewDepth),
        });
        const visibleSlide = personalizedModel.slides.find((s) => s.slide.id === slide.id);
        const blocksToRender = visibleSlide ? visibleSlide.blocks : (slide.reader?.blocks ?? []);

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
    const slideWarnings = (state.validation?.warnings ?? []).filter((w) => {
      return w.path?.includes(slide?.id ?? '') || !w.path?.includes('slides');
    });

    const diagnostics = h('div', { class: 'slipr-preview-diagnostics' });
    if (slideWarnings.length > 0) {
      diagnostics.append(
        h('div', { class: 'slipr-warning-pill' }, [
          `⚠ ${slideWarnings.length} warning${slideWarnings.length > 1 ? 's' : ''}: ${slideWarnings[0].message}`,
        ])
      );
    }

    root.append(header, viewport, diagnostics);
  }

  store.subscribe(({ changedKeys }) => {
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
}
