// @ts-check
/**
 * Search UI: a modal dialog (open with "/" or the top-bar button) that
 * searches as you type. ↑/↓ move through results, Enter opens one. Matching
 * text is then highlighted on the page with the CSS Custom Highlight API.
 */
import { h } from '../js/dom.js';
import { search, tokens, fold } from './search-index.js';

/**
 * @param {{
 *   docs: import('./search-index.js').SearchDoc[],
 *   visible: (doc: import('./search-index.js').SearchDoc) => boolean,
 *   includeNotes: () => boolean,
 *   onSelect: (doc: import('./search-index.js').SearchDoc) => HTMLElement | null,
 *   onShowEverything: () => void,
 *   prepare?: () => Promise<void>,
 * }} io
 *   `prepare`: runs once, on the first open (e.g. reading PDF text into `docs`, I-072).
 */
export function createSearch(io) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'search', class: 'reader-search-input', placeholder: 'Search this show…',
    'aria-label': 'Search this show', autocomplete: 'off', spellcheck: 'false',
  }));
  const list = h('ul', { class: 'reader-search-results', role: 'list' });
  const status = h('p', { class: 'reader-search-status', role: 'status', 'aria-live': 'polite' });
  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'reader-dialog reader-search', 'aria-label': 'Search' }, [
    h('form', { method: 'dialog', class: 'reader-search-form' }, [input]),
    status,
    list,
  ]));
  document.body.append(dialog);

  const button = h('button', { type: 'button', class: 'reader-tool', title: 'Search (/)' }, [
    h('span', { 'aria-hidden': 'true' }, ['⌕']), h('span', { class: 'reader-tool-label' }, ['Search']),
  ]);
  button.addEventListener('click', () => open());

  /** @type {HTMLButtonElement[]} */
  let buttons = [];
  const run = () => {
    const q = input.value;
    const { results, hidden } = search(io.docs, q, { visible: io.visible, includeNotes: io.includeNotes() });
    buttons = results.map((r) => {
      const b = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'reader-search-result' }, [
        h('span', { class: 'reader-search-result-title' }, [r.doc.title]),
      ]));
      if (r.doc.kind === 'glossary') b.classList.add('is-glossary');
      const snippet = h('span', { class: 'reader-search-result-snippet' });
      snippet.innerHTML = r.snippetHtml; // escaped by search-index.js, only <mark> added
      b.append(snippet);
      b.addEventListener('click', () => select(r.doc, q));
      return b;
    });
    list.replaceChildren(...buttons.map((b) => h('li', {}, [b])));
    status.replaceChildren();
    if (!tokens(q).length) return;
    status.append(results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No results');
    if (hidden) {
      const more = h('button', { type: 'button', class: 'reader-link-button' }, ['show everything']);
      more.addEventListener('click', () => { io.onShowEverything(); run(); });
      status.append(` · ${hidden} more in content hidden by your tailoring: `, more);
    }
  };
  input.addEventListener('input', run);

  dialog.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[Math.min(buttons.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) input.focus();
      else buttons[i - 1].focus();
    } else if (e.key === 'Enter' && document.activeElement === input && buttons[0]) {
      e.preventDefault();
      buttons[0].click();
    }
  });
  // Click on the backdrop closes the dialog.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  /** @param {import('./search-index.js').SearchDoc} doc @param {string} query */
  const select = (doc, query) => {
    dialog.close();
    const target = io.onSelect(doc);
    if (target) highlightTerms(target, tokens(query));
  };

  /** @type {Promise<void> | null} */
  let prepared = null;
  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    run();
    if (io.prepare && !prepared) {
      status.textContent = 'Reading the PDFs in this show…';
      prepared = io.prepare().catch((err) => console.warn('Slipr: search preparation failed:', err)).finally(() => run());
    }
  };
  return { button, open };
}

/**
 * Mark query words inside an element for a few seconds.
 * @param {HTMLElement} root @param {string[]} terms
 */
export function highlightTerms(root, terms) {
  const registry = /** @type {any} */ (globalThis.CSS)?.highlights;
  if (!registry || !terms.length) return;
  const ranges = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    const folded = fold(text);
    for (const term of terms) {
      for (let i = folded.text.indexOf(term); i !== -1; i = folded.text.indexOf(term, i + 1)) {
        if (i > 0 && /[\p{L}\p{N}]/u.test(folded.text[i - 1])) continue;
        const range = new Range();
        range.setStart(node, folded.map[i]);
        range.setEnd(node, folded.map[i + term.length]);
        ranges.push(range);
      }
    }
  }
  // @ts-ignore Highlight is not in every lib.dom version yet
  registry.set('slipr-search', new Highlight(...ranges));
  setTimeout(() => registry.delete('slipr-search'), 5000);
}
