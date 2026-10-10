// @ts-check
/**
 * Global Search & Replace dialog for the Slipr Editor (I-025).
 * Allows searching across slides, blocks, notes, and metadata,
 * previewing matches, and replacing within the current slide or across the entire show.
 */

import { h } from '../dom.js';
import { findMatches } from '../actions.js';

/**
 * Open the Find & Replace modal dialog.
 * @param {import('../store.js').EditorStore} store
 * @returns {HTMLDialogElement}
 */
export function openFindReplaceDialog(store) {
  // If an existing dialog is open, focus it
  const existing = document.querySelector('dialog.slipr-find-replace-dialog');
  if (existing instanceof HTMLDialogElement) {
    existing.focus();
    return existing;
  }

  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', {
    class: 'slipr-dialog slipr-find-replace-dialog',
    'aria-label': 'Find and Replace',
  }));

  const findInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text',
    class: 'slipr-input',
    placeholder: 'Find…',
  }));

  const replaceInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text',
    class: 'slipr-input',
    placeholder: 'Replace with…',
  }));

  const matchCaseCheck = /** @type {HTMLInputElement} */ (h('input', {
    type: 'checkbox',
  }));

  const matchWordCheck = /** @type {HTMLInputElement} */ (h('input', {
    type: 'checkbox',
  }));

  const statusEl = h('div', { class: 'slipr-find-status' }, ['Type a term to search']);
  const matchesList = h('div', { class: 'slipr-find-matches' });

  const replaceCurrentBtn = /** @type {HTMLButtonElement} */ (h(
    'button',
    {
      type: 'button',
      class: 'slipr-btn',
      disabled: true,
    },
    ['Replace in Current Slide']
  ));

  const replaceAllBtn = /** @type {HTMLButtonElement} */ (h(
    'button',
    {
      type: 'button',
      class: 'slipr-btn slipr-btn-primary',
      disabled: true,
    },
    ['Replace All']
  ));

  /** @type {import('../actions.js').SearchResults} */
  let currentResults = { totalMatches: 0, matches: [] };

  function performSearch() {
    const query = findInput.value;
    if (!query || query.trim() === '') {
      currentResults = { totalMatches: 0, matches: [] };
      statusEl.textContent = 'Type a term to search';
      matchesList.replaceChildren();
      matchesList.hidden = true;
      replaceCurrentBtn.disabled = true;
      replaceAllBtn.disabled = true;
      return;
    }

    currentResults = findMatches(store.state.show, {
      query,
      matchCase: matchCaseCheck.checked,
      matchWholeWord: matchWordCheck.checked,
    });

    const total = currentResults.totalMatches;
    const selectedSlideId = store.state.selectedSlideId;
    const matchesInSelected = currentResults.matches.filter((m) => m.slideId === selectedSlideId).length;

    replaceAllBtn.disabled = total === 0;
    replaceCurrentBtn.disabled = matchesInSelected === 0;

    if (total === 0) {
      statusEl.textContent = 'No matches found';
      matchesList.replaceChildren();
      matchesList.hidden = true;
      return;
    }

    matchesList.hidden = false;
    const distinctSlides = new Set(currentResults.matches.map((m) => m.slideId ?? 'show')).size;
    statusEl.textContent = `Found ${total} match${total === 1 ? '' : 'es'} across ${distinctSlides} location${distinctSlides === 1 ? '' : 's'}:`;

    matchesList.replaceChildren(
      ...currentResults.matches.slice(0, 50).map((m) => {
        // Snippet with bracketed [match] converted to <mark>
        const parts = m.snippet.split(/(\[[^\]]+\])/);
        const snippetNodes = parts.map((part) => {
          if (part.startsWith('[') && part.endsWith(']')) {
            return h('mark', {}, [part.slice(1, -1)]);
          }
          return part;
        });

        return h(
          'div',
          {
            class: 'slipr-find-match-item',
            title: m.slideId ? `Click to jump to ${m.slideTitle}` : undefined,
            onclick: () => {
              if (m.slideId) {
                store.selectSlide(m.slideId);
              }
            },
          },
          [
            h('div', { class: 'slipr-find-match-location' }, [
              m.slideIndex ? `Slide ${m.slideIndex}: ${m.slideTitle} (${m.location})` : `${m.slideTitle} (${m.location})`,
            ]),
            h('div', { class: 'slipr-find-match-snippet' }, snippetNodes),
          ]
        );
      })
    );

    if (currentResults.matches.length > 50) {
      matchesList.append(h('p', { class: 'slipr-help' }, [`…and ${currentResults.matches.length - 50} more matches`]));
    }
  }

  // Event handlers
  findInput.addEventListener('input', performSearch);
  matchCaseCheck.addEventListener('change', performSearch);
  matchWordCheck.addEventListener('change', performSearch);

  replaceCurrentBtn.addEventListener('click', () => {
    const find = findInput.value;
    const replaceWith = replaceInput.value;
    const slideId = store.state.selectedSlideId;
    if (!find || !slideId) return;

    store.dispatch('replaceSlideText', {
      slideId,
      find,
      replaceWith,
      matchCase: matchCaseCheck.checked,
      matchWholeWord: matchWordCheck.checked,
    });

    performSearch();
    statusEl.textContent = `Replaced occurrences in current slide.`;
  });

  replaceAllBtn.addEventListener('click', () => {
    const find = findInput.value;
    const replaceWith = replaceInput.value;
    if (!find) return;

    const countBefore = currentResults.totalMatches;
    store.dispatch('replaceAllText', {
      find,
      replaceWith,
      matchCase: matchCaseCheck.checked,
      matchWholeWord: matchWordCheck.checked,
    });

    performSearch();
    statusEl.textContent = `Replaced ${countBefore} match${countBefore === 1 ? '' : 'es'} across the show.`;
  });

  const header = h('div', { class: 'slipr-find-replace-header' }, [
    h('h2', { class: 'slipr-dialog-title' }, ['Find & Replace']),
    h(
      'button',
      {
        type: 'button',
        class: 'slipr-dialog-close-btn',
        'aria-label': 'Close',
        onclick: () => dialog.close(),
      },
      ['✕']
    ),
  ]);

  const form = h('div', { class: 'slipr-dialog-form' }, [
    h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Find']),
      findInput,
    ]),
    h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Replace with']),
      replaceInput,
    ]),
    h('div', { class: 'slipr-find-options' }, [
      h('label', { class: 'slipr-checkbox-label' }, [matchCaseCheck, ' Match case']),
      h('label', { class: 'slipr-checkbox-label' }, [matchWordCheck, ' Whole word']),
    ]),
    statusEl,
    matchesList,
    h('div', { class: 'slipr-dialog-actions' }, [
      replaceCurrentBtn,
      replaceAllBtn,
      h('button', { type: 'button', class: 'slipr-btn', onclick: () => dialog.close() }, ['Close']),
    ]),
  ]);

  dialog.append(header, form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();

  // Auto-focus find input
  queueMicrotask(() => findInput.focus());

  return dialog;
}
