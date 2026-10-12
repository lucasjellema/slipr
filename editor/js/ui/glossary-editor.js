// @ts-check
/**
 * Dedicated Glossary Editor (I-088): a full-page/view in the editor dedicated
 * to managing the show's glossary, with deck-aware word completion, usage
 * inspection, jump-to-slide navigation, and Markdown definition preview.
 */

import { h, isTextEntry, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { markdown } from '../../../shared/markdown.js';
import { uniqueId } from '../show-entities.js';
import { openConfirmDialog, showBanner } from './dialogs.js';
import { markdownToolbar } from './markdown-toolbar.js';

/** Actions the glossary form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['upsertGlossaryTerm']);
import {
  scanDeckCandidates,
  suggestWordCompletions,
  getAllGlossaryEntries,
  getDetailedGlossaryEntry,
  filterAndSortGlossary,
  suggestIdForTerm,
} from '../glossary-model.js';

/**
 * Mount the dedicated glossary editor inside host (.slipr-editor-main).
 * @param {HTMLElement} host
 * @param {import('../store.js').EditorStore} store
 * @param {{ onSelectSlide?: (slideId: string) => void }} [options]
 * @returns {{
 *   open: (termId?: string) => void,
 *   close: () => void,
 *   toggle: () => void,
 *   isOpen: () => boolean,
 *   selectTerm: (termId: string) => void,
 * }}
 */
export function mountGlossaryEditor(host, store, options = {}) {
  const view = h('section', { class: 'slipr-glossary-view', hidden: true, 'aria-label': 'Glossary editor' });
  host.append(view);

  /** @type {string | null} */
  let activeId = null;
  /** @type {string} */
  let searchQuery = '';
  /** @type {'all' | 'in-use' | 'orphaned' | 'no-definition'} */
  let currentFilter = 'all';
  /** @type {'name-asc' | 'name-desc' | 'uses-desc' | 'uses-asc'} */
  let currentSort = 'name-asc';
  /** @type {boolean} */
  let showSuggestionsPanel = false;
  /** @type {string} */
  let autocompleteQuery = '';
  /** @type {boolean} */
  let showAutocomplete = false;

  /** @type {import('../glossary-model.js').CandidateTerm[]} */
  let cachedCandidates = [];

  // Top header, split container, and screenreader announcement live region
  const header = h('header', { class: 'slipr-glossary-header' });
  const split = h('div', { class: 'slipr-glossary-split' });
  const live = h('div', { class: 'slipr-visually-hidden', 'aria-live': 'polite' });
  view.append(header, split, live);

  const sidebar = h('aside', { class: 'slipr-glossary-sidebar' });
  const mainPane = h('main', { class: 'slipr-glossary-main' });
  const suggestionsDrawer = h('aside', { class: 'slipr-glossary-drawer', hidden: true });
  split.append(sidebar, mainPane, suggestionsDrawer);

  const say = (/** @type {string} */ text) => { live.textContent = text; };

  // ------------------------------------------------------------------ open / close
  function open(/** @type {string | undefined} */ termId = undefined) {
    view.hidden = false;
    document.body.classList.add('is-glossary-open');
    refreshCandidates();

    const all = getAllGlossaryEntries(store.state.show);
    if (termId && all.some((e) => e.id === termId)) {
      activeId = termId;
    } else if (!activeId || !all.some((e) => e.id === activeId)) {
      activeId = all[0]?.id ?? null;
    }

    render();
    say(`Glossary editor open. ${all.length} terms in glossary.`);
    // Focus search or list
    const searchInput = /** @type {HTMLInputElement | null} */ (sidebar.querySelector('.slipr-glossary-search-input'));
    searchInput?.focus();
  }

  function close() {
    view.hidden = true;
    document.body.classList.remove('is-glossary-open');
    showAutocomplete = false;
  }

  function toggle() {
    if (view.hidden) open();
    else close();
  }

  function isOpen() {
    return !view.hidden;
  }

  function selectTerm(/** @type {string} */ termId) {
    activeId = termId;
    render();
  }

  function refreshCandidates() {
    try {
      cachedCandidates = scanDeckCandidates(store.state.show);
    } catch {
      cachedCandidates = [];
    }
  }

  // ------------------------------------------------------------------ actions
  function addNewTerm(/** @type {string | undefined} */ initialName = undefined) {
    const show = store.state.show;
    const existing = Object.keys(show?.glossary ?? {});
    const name = initialName?.trim() || 'New term';
    const id = suggestIdForTerm(name, existing);

    store.dispatch('upsertGlossaryTerm', { id, term: name, definition: '' });
    activeId = id;
    refreshCandidates();
    render();

    // Focus the term name input
    setTimeout(() => {
      const nameInput = /** @type {HTMLInputElement | null} */ (mainPane.querySelector('#slipr-glossary-input-name'));
      nameInput?.focus();
      nameInput?.select();
    }, 20);
    say(`Added term "${name}".`);
  }

  function jumpToSlide(/** @type {string} */ slideId) {
    close();
    store.selectSlide(slideId);
    store.setActiveTab('slide');
    if (options.onSelectSlide) options.onSelectSlide(slideId);
  }

  function promptDelete(/** @type {string} */ id) {
    const show = store.state.show;
    const detail = getDetailedGlossaryEntry(show, id);
    if (!detail) return;

    const termName = detail.term;
    const uses = detail.explicitCount;

    if (uses > 0) {
      openConfirmDialog({
        title: `Delete "${termName}" from glossary?`,
        text: `It is referenced ${uses} time${uses === 1 ? '' : 's'} in Markdown ([[${id}]]):`,
        items: detail.explicitRefs.map((r) => `${r.where} (${r.count}×)`),
        actions: [
          {
            label: 'Delete, leave references as [[...]]',
            run: () => {
              store.dispatch('deleteGlossaryTerm', { id });
              onDeleted(id);
            },
          },
          {
            label: 'Delete, keep words as plain text (unlink)',
            kind: 'danger',
            run: () => {
              store.dispatch('deleteGlossaryTerm', { id, unlink: true });
              onDeleted(id);
            },
          },
        ],
      });
    } else {
      openConfirmDialog({
        title: `Delete "${termName}"?`,
        text: 'This term is not referenced in the presentation.',
        actions: [
          {
            label: 'Delete term',
            kind: 'danger',
            run: () => {
              store.dispatch('deleteGlossaryTerm', { id });
              onDeleted(id);
            },
          },
        ],
      });
    }
  }

  function onDeleted(/** @type {string} */ id) {
    refreshCandidates();
    const all = getAllGlossaryEntries(store.state.show);
    activeId = all[0]?.id ?? null;
    render();
    say(`Deleted term "${id}".`);
  }

  function renameTermId(/** @type {string} */ oldId, /** @type {string} */ nextId) {
    const trimmed = nextId.trim();
    if (!trimmed || trimmed === oldId) return;

    const show = store.state.show;
    const existing = Object.keys(show?.glossary ?? {}).filter((k) => k !== oldId);
    if (existing.includes(trimmed)) {
      showBanner(`A glossary term with ID "${trimmed}" already exists.`, 'error');
      return;
    }

    store.dispatch('renameGlossaryTerm', { oldId, newId: trimmed });
    activeId = trimmed;
    refreshCandidates();
    render();
    showBanner(`Renamed ID to "${trimmed}" and updated references.`, 'info');
  }

  // ------------------------------------------------------------------ rendering
  function render() {
    if (view.hidden) return;
    renderHeader();
    renderSidebar();
    renderMain();
    renderDrawer();
  }

  function renderHeader() {
    header.innerHTML = '';
    const show = store.state.show;
    const all = getAllGlossaryEntries(show);
    const totalRefs = all.reduce((sum, e) => sum + e.totalUses, 0);
    const orphanedCount = all.filter((e) => e.isOrphaned).length;

    const brand = h('div', { class: 'slipr-glossary-header-brand' }, [
      h('span', { class: 'slipr-glossary-header-icon' }, ['📖']),
      h('h1', { class: 'slipr-glossary-header-title' }, ['Glossary Editor']),
      h('span', { class: 'slipr-glossary-stats-badge' }, [
        `${all.length} term${all.length === 1 ? '' : 's'}`,
        ' · ',
        `${totalRefs} reference${totalRefs === 1 ? '' : 's'}`,
        orphanedCount > 0 ? h('span', { class: 'slipr-glossary-orphaned-badge' }, [` · ⚠️ ${orphanedCount} unused`]) : null,
      ]),
    ]);

    const tools = h('div', { class: 'slipr-glossary-header-tools' }, [
      h(
        'button',
        {
          type: 'button',
          class: 'slipr-btn slipr-btn-primary',
          title: 'Add a new glossary term (Ctrl+N or +)',
          onclick: () => addNewTerm(),
        },
        ['+ New Term']
      ),
      h(
        'button',
        {
          type: 'button',
          class: `slipr-btn ${showSuggestionsPanel ? 'slipr-btn-accent' : ''}`,
          title: 'Terms and acronyms found in the presentation that are not yet in the glossary',
          onclick: () => {
            showSuggestionsPanel = !showSuggestionsPanel;
            render();
          },
        },
        [`💡 Deck suggestions (${cachedCandidates.length})`]
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'slipr-btn',
          title: 'Close glossary editor (Esc)',
          onclick: close,
        },
        ['✕ Back to slides']
      ),
    ]);

    header.append(brand, tools);
  }

  function renderSidebar() {
    sidebar.innerHTML = '';
    const show = store.state.show;
    const all = getAllGlossaryEntries(show);
    const filtered = filterAndSortGlossary(all, {
      search: searchQuery,
      filter: currentFilter,
      sort: currentSort,
    });

    // 1. Search bar
    const searchBox = h('div', { class: 'slipr-glossary-search-box' }, [
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-glossary-search-input',
        placeholder: '🔍 Search terms, aliases, definitions…',
        value: searchQuery,
        'aria-label': 'Search glossary',
        oninput: (e) => {
          searchQuery = /** @type {HTMLInputElement} */ (e.target).value;
          renderSidebar();
        },
      }),
      searchQuery
        ? h(
            'button',
            {
              type: 'button',
              class: 'slipr-glossary-clear-btn',
              title: 'Clear search',
              onclick: () => {
                searchQuery = '';
                renderSidebar();
              },
            },
            ['✕']
          )
        : null,
    ]);

    // 2. Filter tabs / pills
    const inUseCount = all.filter((e) => e.totalUses > 0).length;
    const orphanedCount = all.filter((e) => e.isOrphaned).length;
    const noDefCount = all.filter((e) => !e.hasDefinition).length;

    const filterPills = h('div', { class: 'slipr-glossary-filter-bar' }, [
      makeFilterBtn('all', `All (${all.length})`),
      makeFilterBtn('in-use', `In Use (${inUseCount})`),
      makeFilterBtn('orphaned', `Unused (${orphanedCount})`, orphanedCount > 0 ? 'is-warning' : ''),
      makeFilterBtn('no-definition', `No Def (${noDefCount})`),
    ]);

    // 3. Sort bar
    const sortSelect = /** @type {HTMLSelectElement} */ (h(
      'select',
      {
        class: 'slipr-select slipr-select-sm slipr-glossary-sort-select',
        'aria-label': 'Sort terms',
        onchange: () => {
          currentSort = /** @type {any} */ (sortSelect.value);
          renderSidebar();
        },
      },
      [
        h('option', { value: 'name-asc', selected: currentSort === 'name-asc' ? true : undefined }, ['Sort: A → Z']),
        h('option', { value: 'name-desc', selected: currentSort === 'name-desc' ? true : undefined }, ['Sort: Z → A']),
        h('option', { value: 'uses-desc', selected: currentSort === 'uses-desc' ? true : undefined }, ['Sort: Most used']),
        h('option', { value: 'uses-asc', selected: currentSort === 'uses-asc' ? true : undefined }, ['Sort: Least used']),
      ]
    ));

    const sortRow = h('div', { class: 'slipr-glossary-sort-row' }, [
      h('span', { class: 'slipr-help' }, [`Showing ${filtered.length} of ${all.length}`]),
      sortSelect,
    ]);

    // 4. Terms list
    const listEl = h('div', { class: 'slipr-glossary-list', role: 'listbox', 'aria-label': 'Glossary terms' });

    if (!filtered.length) {
      listEl.append(
        h('div', { class: 'slipr-glossary-empty' }, [
          h('p', {}, [all.length === 0 ? 'No glossary terms defined yet.' : 'No terms match your search/filter.']),
          all.length === 0
            ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-primary', onclick: () => addNewTerm() }, ['+ Add first term'])
            : null,
        ])
      );
    } else {
      filtered.forEach((entry) => {
        const isSelected = entry.id === activeId;
        const item = h(
          'div',
          {
            class: `slipr-glossary-item ${isSelected ? 'is-selected' : ''}`,
            role: 'option',
            'aria-selected': isSelected ? 'true' : 'false',
            tabIndex: isSelected ? 0 : -1,
            onclick: () => {
              activeId = entry.id;
              render();
            },
          },
          [
            h('div', { class: 'slipr-glossary-item-row' }, [
              h('span', { class: 'slipr-glossary-item-term' }, [entry.term]),
              entry.isOrphaned
                ? h('span', { class: 'slipr-glossary-badge is-unused', title: 'Not used anywhere in the presentation' }, ['Unused'])
                : h('span', { class: 'slipr-glossary-badge is-used', title: `${entry.totalUses} total uses across presentation` }, [`${entry.totalUses}×`]),
            ]),
            h('div', { class: 'slipr-glossary-item-meta' }, [
              h('code', { class: 'slipr-glossary-id-tag' }, [`[[${entry.id}]]`]),
              entry.aliases.length
                ? h('span', { class: 'slipr-glossary-aliases-tag', title: `Aliases: ${entry.aliases.join(', ')}` }, [
                    `+${entry.aliases.length} alias${entry.aliases.length === 1 ? '' : 'es'}`,
                  ])
                : null,
            ]),
            entry.definition
              ? h('div', { class: 'slipr-glossary-item-snippet' }, [entry.definition.slice(0, 75).trim() + (entry.definition.length > 75 ? '…' : '')])
              : h('div', { class: 'slipr-glossary-item-snippet is-empty' }, ['(No definition yet)']),
          ]
        );
        listEl.append(item);
      });
    }

    const addBar = h('div', { class: 'slipr-glossary-add-bar' }, [
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => addNewTerm() }, ['+ Add term']),
    ]);

    sidebar.append(searchBox, filterPills, sortRow, listEl, addBar);
  }

  /**
   * @param {'all' | 'in-use' | 'orphaned' | 'no-definition'} key
   * @param {string} label
   * @param {string} [extraClass]
   */
  function makeFilterBtn(key, label, extraClass = '') {
    return h(
      'button',
      {
        type: 'button',
        class: `slipr-filter-pill ${currentFilter === key ? 'is-active' : ''} ${extraClass}`.trim(),
        onclick: () => {
          currentFilter = key;
          renderSidebar();
        },
      },
      [label]
    );
  }

  function renderMain() {
    mainPane.innerHTML = '';
    const show = store.state.show;
    if (!activeId || !show?.glossary?.[activeId]) {
      mainPane.append(
        h('div', { class: 'slipr-glossary-detail-empty' }, [
          h('div', { class: 'slipr-glossary-detail-empty-icon' }, ['📖']),
          h('h2', {}, ['No term selected']),
          h('p', { class: 'slipr-help' }, ['Select a glossary term from the list on the left, or add a new term.']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-primary', onclick: () => addNewTerm() }, ['+ Add new term']),
        ])
      );
      return;
    }

    const termId = activeId;
    const detail = getDetailedGlossaryEntry(show, termId);
    if (!detail) return;

    // Active term editor panel
    const formPanel = h('div', { class: 'slipr-glossary-detail-panel' });

    // 1. Top bar: Term Title + Actions
    const titleBar = h('div', { class: 'slipr-glossary-detail-header' }, [
      h('div', { class: 'slipr-glossary-detail-title-group' }, [
        h('h2', { class: 'slipr-glossary-detail-title' }, [detail.term]),
        h('span', { class: 'slipr-help' }, [`ID: `, h('code', {}, [termId])]),
      ]),
      h('div', { class: 'slipr-glossary-detail-actions' }, [
        h(
          'button',
          {
            type: 'button',
            class: 'slipr-btn slipr-btn-sm',
            title: `Copy [[${termId}]] Markdown reference to clipboard`,
            onclick: async (e) => {
              const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
              try {
                await navigator.clipboard.writeText(`[[${termId}]]`);
                const orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(() => { btn.textContent = orig; }, 1500);
              } catch {
                showBanner(`Copy [[${termId}]] to reference this term.`, 'info');
              }
            },
          },
          ['Copy [[id]]']
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'slipr-btn slipr-btn-sm slipr-btn-danger',
            title: 'Delete this term',
            onclick: () => promptDelete(termId),
          },
          ['🗑 Delete term']
        ),
      ]),
    ]);

    // 2. Form Fields
    const fieldsContainer = h('div', { class: 'slipr-glossary-form' });

    /** @param {Record<string, any>} patch */
    const updateTerm = (patch, /** @type {string} */ key) => {
      const current = store.state.show?.glossary?.[termId] ?? detail;
      store.dispatch(
        'upsertGlossaryTerm',
        {
          id: termId,
          term: current.term,
          aliases: current.aliases,
          definition: current.definition ?? '',
          link: current.link,
          ...patch,
        },
        { coalesceKey: `glossary-${key}-${termId}` }
      );
    };

    // A. Term Name with deck-aware autocomplete!
    const nameWrapper = h('div', { class: 'slipr-form-group slipr-glossary-autocomplete-wrapper' });
    const nameInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text',
      id: 'slipr-glossary-input-name',
      class: 'slipr-input',
      value: detail.term,
      placeholder: 'e.g. WebSocket, Reveal.js, Component',
      autocomplete: 'off',
      oninput: (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value;
        autocompleteQuery = val;
        showAutocomplete = Boolean(val.trim());
        updateTerm({ term: val }, 'term');
        renderAutocompleteDropdown(nameWrapper, nameInput, termId);
        const titleEl = mainPane.querySelector('.slipr-glossary-detail-title');
        if (titleEl) titleEl.textContent = val || 'Untitled term';
        const itemTerm = sidebar.querySelector('.slipr-glossary-item.is-selected .slipr-glossary-item-term');
        if (itemTerm) itemTerm.textContent = val || 'Untitled term';
      },
      onfocus: () => {
        autocompleteQuery = nameInput.value;
        showAutocomplete = true;
        renderAutocompleteDropdown(nameWrapper, nameInput, termId);
      },
      onblur: () => {
        // Small delay so clicks on dropdown items can register
        setTimeout(() => {
          showAutocomplete = false;
          renderAutocompleteDropdown(nameWrapper, nameInput, termId);
        }, 200);
      },
    }));

    nameWrapper.append(
      h('label', { class: 'slipr-label', for: 'slipr-glossary-input-name' }, [
        'Term Name',
        h('span', { class: 'slipr-help' }, [' (autocomplete suggestions from deck)']),
      ]),
      nameInput
    );
    renderAutocompleteDropdown(nameWrapper, nameInput, termId);

    // B. Stable ID
    let currentIdValue = termId;
    const idInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text',
      id: 'slipr-glossary-input-id',
      class: 'slipr-input slipr-input-monospace',
      value: termId,
      oninput: (e) => {
        currentIdValue = /** @type {HTMLInputElement} */ (e.target).value;
      },
    }));

    const renameBtn = h(
      'button',
      {
        type: 'button',
        class: 'slipr-btn slipr-btn-sm',
        title: 'Rename this ID and automatically rewrite all [[id]] references across the show',
        onclick: () => renameTermId(termId, currentIdValue),
      },
      ['Rename ID']
    );

    const idGroup = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label', for: 'slipr-glossary-input-id' }, ['Stable Identifier (ID)']),
      h('div', { class: 'slipr-input-with-button' }, [idInput, renameBtn]),
      h('p', { class: 'slipr-help' }, [`Used in Markdown as [[${termId}]] or [[${termId}|custom text]].`]),
    ]);

    // C. Other Names / Aliases (show format 0.2, I-086)
    const aliasesInput = h('input', {
      type: 'text',
      id: 'slipr-glossary-input-aliases',
      class: 'slipr-input',
      value: detail.aliases.join(', '),
      placeholder: 'e.g. WebSockets, ws, real-time socket',
      oninput: (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value;
        updateTerm({ aliases: val }, 'aliases');
      },
    });

    const aliasesGroup = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label', for: 'slipr-glossary-input-aliases' }, ['Other Names / Aliases (comma-separated)']),
      aliasesInput,
      h('p', { class: 'slipr-help' }, [
        'Reader mode automatically links these phrases on slides, and search finds them.',
      ]),
    ]);

    // D. External Link
    const linkInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'url',
      id: 'slipr-glossary-input-link',
      class: 'slipr-input',
      value: detail.link ?? '',
      placeholder: 'https://example.com/docs',
      oninput: (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value;
        updateTerm({ link: val || undefined }, 'link');
      },
    }));

    const linkGroup = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label', for: 'slipr-glossary-input-link' }, ['External Link (optional)']),
      h('div', { class: 'slipr-input-with-button' }, [
        linkInput,
        detail.link
          ? h(
              'a',
              {
                class: 'slipr-btn slipr-btn-sm',
                href: detail.link,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: 'Open link in new tab',
              },
              ['↗ Open']
            )
          : null,
      ]),
    ]);

    // E. Definition (Markdown)
    const defTextarea = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      id: 'slipr-glossary-input-def',
      class: 'slipr-textarea',
      rows: 5,
      placeholder: 'Explain what this term means. Supports **bold**, *italic*, `code`, and [links](url).',
      oninput: (e) => {
        const val = /** @type {HTMLTextAreaElement} */ (e.target).value;
        updateTerm({ definition: val }, 'definition');
        renderPreview();
        const snippetEl = sidebar.querySelector('.slipr-glossary-item.is-selected .slipr-glossary-item-snippet');
        if (snippetEl) {
          snippetEl.textContent = val.trim() ? val.slice(0, 75).trim() + (val.length > 75 ? '…' : '') : '(No definition yet)';
          snippetEl.classList.toggle('is-empty', !val.trim());
        }
      },
    }, [detail.definition]));

    const defToolbar = markdownToolbar(defTextarea, { show, slideId: '' });

    // F. Live Definition Preview box
    const previewBox = h('div', { class: 'slipr-glossary-preview-box' });
    const renderPreview = () => {
      previewBox.innerHTML = '';
      const text = defTextarea.value.trim();
      const popupContent = h('div', { class: 'slipr-glossary-preview-content' });
      if (text) {
        try {
          popupContent.innerHTML = markdown(text, { mode: 'reader', glossary: show?.glossary });
        } catch {
          popupContent.textContent = text;
        }
      } else {
        popupContent.innerHTML = '<em>(Definition preview will appear here as you type)</em>';
      }

      previewBox.append(
        h('div', { class: 'slipr-glossary-preview-header' }, [
          h('span', { class: 'slipr-glossary-preview-title' }, [`Reader Popup Preview: ${detail.term}`]),
        ]),
        popupContent
      );
    };
    renderPreview();

    const defGroup = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label', for: 'slipr-glossary-input-def' }, ['Definition (Markdown)']),
      defToolbar,
      defTextarea,
      h('p', { class: 'slipr-help' }, ['Shown in an interactive popup in reader mode when readers click or hover the term.']),
      previewBox,
    ]);

    fieldsContainer.append(nameWrapper, idGroup, aliasesGroup, linkGroup, defGroup);

    // 3. Usage & References Section
    const usageSection = renderUsageSection(detail);

    formPanel.append(titleBar, fieldsContainer, usageSection);
    mainPane.append(formPanel);
  }

  /**
   * Render deck-aware autocomplete suggestions dropdown underneath the term name input.
   * @param {HTMLElement} wrapper
   * @param {HTMLInputElement} input
   * @param {string} termId
   */
  function renderAutocompleteDropdown(wrapper, input, termId) {
    let dropdown = wrapper.querySelector('.slipr-glossary-autocomplete-menu');
    if (!showAutocomplete) {
      dropdown?.remove();
      return;
    }

    if (!dropdown) {
      dropdown = h('div', { class: 'slipr-glossary-autocomplete-menu' });
      wrapper.append(dropdown);
    }
    dropdown.innerHTML = '';

    const suggestions = suggestWordCompletions(autocompleteQuery, cachedCandidates, { limit: 6 });
    if (!suggestions.length) {
      dropdown.remove();
      return;
    }

    const heading = h('div', { class: 'slipr-glossary-autocomplete-heading' }, ['Suggested words from your presentation:']);
    dropdown.append(heading);

    suggestions.forEach((cand) => {
      const item = h(
        'button',
        {
          type: 'button',
          class: 'slipr-glossary-autocomplete-item',
          onclick: () => {
            input.value = cand.term;
            // Update term
            store.dispatch(
              'upsertGlossaryTerm',
              {
                id: termId,
                term: cand.term,
                definition: store.state.show?.glossary?.[termId]?.definition ?? '',
                aliases: store.state.show?.glossary?.[termId]?.aliases,
                link: store.state.show?.glossary?.[termId]?.link,
              },
              { coalesceKey: `glossary-term-${termId}` }
            );
            // If the term still had default name 'new-term', offer to rename ID
            if (termId.startsWith('new-term') || termId.startsWith('term-')) {
              const nextId = suggestIdForTerm(cand.term, Object.keys(store.state.show?.glossary ?? {}).filter((k) => k !== termId));
              renameTermId(termId, nextId);
            }
            showAutocomplete = false;
            render();
          },
        },
        [
          h('span', { class: 'slipr-glossary-cand-name' }, [cand.term]),
          h('span', { class: 'slipr-glossary-cand-count' }, [`${cand.count}× in deck (${cand.kind})`]),
        ]
      );
      dropdown.append(item);
    });
  }

  /**
   * Render the Usage Inspection and Slide References section.
   * @param {import('../glossary-model.js').DetailedGlossaryEntry} detail
   * @returns {HTMLElement}
   */
  function renderUsageSection(detail) {
    const section = h('fieldset', { class: 'slipr-fieldset slipr-glossary-usage-section' });
    const isOrphaned = detail.isOrphaned;

    section.append(
      h('legend', {}, [
        `Usage & References (${detail.totalUses})`,
      ])
    );

    if (isOrphaned) {
      section.append(
        h('div', { class: 'slipr-glossary-orphaned-notice' }, [
          h('span', { class: 'slipr-glossary-orphaned-icon' }, ['⚠️']),
          h('div', {}, [
            h('strong', {}, ['Orphaned term: ']),
            'This term is not referenced or mentioned anywhere in the presentation.',
          ]),
          h(
            'button',
            {
              type: 'button',
              class: 'slipr-btn slipr-btn-sm slipr-btn-danger',
              onclick: () => promptDelete(detail.id),
            },
            ['Delete unused term']
          ),
        ])
      );
    } else {
      const summaryText = `Referenced ${detail.explicitCount}× in Markdown and mentioned ${detail.mentionCount}× in slide text.`;
      section.append(h('p', { class: 'slipr-help' }, [summaryText]));

      const refsList = h('div', { class: 'slipr-glossary-refs-list' });

      // Explicit references
      if (detail.explicitRefs.length) {
        detail.explicitRefs.forEach((ref) => {
          const row = h('div', { class: 'slipr-glossary-ref-row' }, [
            h('span', { class: 'slipr-glossary-ref-title' }, [`[[ ]] ${ref.where}`]),
            h('span', { class: 'slipr-glossary-badge is-used' }, [`${ref.count}×`]),
            ref.slideId
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'slipr-btn slipr-btn-sm',
                    title: `Jump to ${ref.where} in the editor`,
                    onclick: () => jumpToSlide(/** @type {string} */ (ref.slideId)),
                  },
                  ['Jump to slide →']
                )
              : null,
          ]);
          refsList.append(row);
        });
      }

      // Text mentions
      if (detail.textMentions.length) {
        detail.textMentions.forEach((men) => {
          const row = h('div', { class: 'slipr-glossary-ref-row is-mention' }, [
            h('span', { class: 'slipr-glossary-ref-title' }, [`Slide ${men.slideNumber}: ${men.slideTitle} (text mention)`]),
            h('span', { class: 'slipr-glossary-badge' }, [`${men.count}×`]),
            h(
              'button',
              {
                type: 'button',
                class: 'slipr-btn slipr-btn-sm',
                title: `Jump to Slide ${men.slideNumber} in the editor`,
                onclick: () => jumpToSlide(men.slideId),
              },
              ['Jump to slide →']
            ),
          ]);
          refsList.append(row);
        });
      }

      section.append(refsList);
    }

    return section;
  }

  function renderDrawer() {
    suggestionsDrawer.hidden = !showSuggestionsPanel;
    if (!showSuggestionsPanel) return;

    suggestionsDrawer.innerHTML = '';
    const drawerHeader = h('div', { class: 'slipr-glossary-drawer-header' }, [
      h('h3', { class: 'slipr-glossary-drawer-title' }, [`💡 Deck Suggestions (${cachedCandidates.length})`]),
      h(
        'button',
        {
          type: 'button',
          class: 'slipr-btn slipr-btn-sm',
          title: 'Close suggestions drawer',
          onclick: () => {
            showSuggestionsPanel = false;
            render();
          },
        },
        ['✕']
      ),
    ]);

    const drawerBody = h('div', { class: 'slipr-glossary-drawer-body' });
    drawerBody.append(
      h('p', { class: 'slipr-help' }, [
        'Terms, acronyms and technical names appearing across slides that are not yet in your glossary. Click "+ Add" to create an entry.',
      ])
    );

    if (!cachedCandidates.length) {
      drawerBody.append(h('p', { class: 'slipr-help' }, ['No unglossaried candidate terms found in this presentation.']));
    } else {
      cachedCandidates.forEach((cand) => {
        const item = h('div', { class: 'slipr-glossary-drawer-item' }, [
          h('div', { class: 'slipr-glossary-drawer-item-info' }, [
            h('div', { class: 'slipr-glossary-drawer-item-title' }, [
              h('strong', {}, [cand.term]),
              h('span', { class: 'slipr-glossary-badge' }, [cand.kind]),
            ]),
            h('span', { class: 'slipr-help' }, [
              `Found ${cand.count}× across ${cand.slideCount} slide${cand.slideCount === 1 ? '' : 's'}`,
            ]),
          ]),
          h(
            'button',
            {
              type: 'button',
              class: 'slipr-btn slipr-btn-sm slipr-btn-primary',
              title: `Create glossary entry for "${cand.term}"`,
              onclick: () => addNewTerm(cand.term),
            },
            ['+ Add']
          ),
        ]);
        drawerBody.append(item);
      });
    }

    suggestionsDrawer.append(drawerHeader, drawerBody);
  }

  // ------------------------------------------------------------------ keyboard shortcuts
  view.addEventListener('keydown', (e) => {
    // 1. Escape closes editor or overlays
    if (e.key === 'Escape') {
      if (showAutocomplete) {
        showAutocomplete = false;
        render();
        e.preventDefault();
        return;
      }
      if (showSuggestionsPanel) {
        showSuggestionsPanel = false;
        render();
        e.preventDefault();
        return;
      }
      close();
      e.preventDefault();
      return;
    }

    // 2. Ctrl+N or '+' to add new term
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      addNewTerm();
      return;
    }

    if (!isTextEntry(e.target) && e.key === '+') {
      e.preventDefault();
      addNewTerm();
      return;
    }

    // 3. Arrow Up / Down in search or list
    const target = /** @type {HTMLElement | null} */ (e.target instanceof HTMLElement ? e.target : null);
    const inListOrSearch = target?.closest('.slipr-glossary-sidebar');
    if (inListOrSearch && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const show = store.state.show;
      const all = getAllGlossaryEntries(show);
      const filtered = filterAndSortGlossary(all, {
        search: searchQuery,
        filter: currentFilter,
        sort: currentSort,
      });

      if (!filtered.length) return;
      const currentIndex = filtered.findIndex((item) => item.id === activeId);
      let nextIndex = currentIndex;

      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < filtered.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : filtered.length - 1;
      }

      if (nextIndex !== currentIndex && filtered[nextIndex]) {
        e.preventDefault();
        activeId = filtered[nextIndex].id;
        render();
        // Scroll item into view
        const itemEl = sidebar.querySelector(`.slipr-glossary-item[aria-selected="true"]`);
        itemEl?.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  // Subscribe to store updates
  store.subscribe((event) => {
    if (view.hidden) return;
    if (event.changedKeys.includes('show')) {
      // Leave the editor alone while it echoes the user's own typing; re-render for anything else (e.g. undo/redo)
      if (isTypingEcho(view, event, TYPING_ACTIONS)) return;
      refreshCandidates();
      rerenderKeepingFocus(view, render);
    }
  });

  return { open, close, toggle, isOpen, selectTerm };
}
