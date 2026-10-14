// @ts-check
/**
 * Slide library dialogs (I-029).
 *
 * - openLibraryDialog(): browse the library (thumbnails show each slide as it
 *   would look in the open show), search and filter (tags, collection,
 *   template, source show), select slides and insert them after the current
 *   slide; manage entries (title, tags, note, collection, order, update from
 *   the current slide, remove), collections, and export / import as a zip.
 * - openCopyToLibraryDialog(): copy slides of the open show into the library,
 *   with tags, a note and a collection.
 */
import { h } from '../dom.js';
import { openDialog, showBanner } from './dialogs.js';
import { renderSlide } from '../../../shared/render.js';
import { hydrateEmbeds } from '../../../shared/embeds/index.js';
import { cleanTags, filterEntries, landing, libraryTags, newLibraryId, prepareInsert, reorderEntries } from '../library/library-model.js';
import { copyToLibrary, insertFromLibrary, updateFromSlide } from '../library/library-io.js';
import { openSlideLibrary } from '../library/library-store.js';
import { pickZipFile } from '../../../shared/zip.js';

/** @typedef {import('../library/library-model.js').LibraryEntry} LibraryEntry */
/** @typedef {import('../library/library-model.js').LibraryCollection} LibraryCollection */
/** @typedef {import('../store.js').EditorStore} EditorStore */

/** @type {Promise<import('../library/library-store.js').SlideLibrary> | null} */
let libraryPromise = null;
/** The library, opened once per page. */
export function getLibrary() {
  if (!libraryPromise) libraryPromise = openSlideLibrary();
  return libraryPromise;
}

/** @param {number} n @param {string} one @param {string} [many] */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A collection select: (none), the collections, and optionally "New collection…".
 * @param {LibraryCollection[]} collections @param {string | null} value @param {string} label
 */
function collectionSelect(collections, value, label) {
  return /** @type {HTMLSelectElement} */ (h('select', { class: 'slipr-select', 'aria-label': label }, [
    h('option', { value: '' }, ['No collection']),
    ...collections.map((c) => h('option', { value: c.id, selected: c.id === value ? true : undefined }, [c.name])),
    h('option', { value: '__new' }, ['New collection…']),
  ]));
}

/**
 * The chosen collection id, creating a new collection when asked.
 * @param {import('../library/library-store.js').SlideLibrary} library
 * @param {HTMLSelectElement} select @param {HTMLInputElement} newName
 * @returns {Promise<string | null>}
 */
async function chosenCollection(library, select, newName) {
  if (select.value !== '__new') return select.value || null;
  const name = newName.value.trim();
  if (!name) return null;
  const collections = await library.collections();
  const existing = collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const collection = { id: newLibraryId('col-'), name, order: collections.length + 1 };
  await library.saveCollection(collection);
  return collection.id;
}

/**
 * Copy slides of the open show into the library.
 * @param {{ store: EditorStore, slideIds: string[], onDone?: () => void }} options
 */
export async function openCopyToLibraryDialog({ store, slideIds, onDone }) {
  const library = await getLibrary();
  const collections = await library.collections();
  const slides = (store.state.show?.slides ?? []).filter((/** @type {any} */ s) => slideIds.includes(s.id));
  if (!slides.length) return;
  const single = slides.length === 1;
  const title = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', value: single ? defaultTitle(slides[0]) : '' }));
  const tags = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', placeholder: 'e.g. intro, pricing, team' }));
  const note = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'slipr-textarea', rows: 2, placeholder: 'Optional: when to use it, what to check' }));
  const select = collectionSelect(collections, null, 'Collection');
  const newName = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', placeholder: 'Name of the new collection', hidden: true }));
  select.addEventListener('change', () => {
    newName.hidden = select.value !== '__new';
    if (!newName.hidden) newName.focus();
  });

  openDialog(single ? 'Copy this slide to the library' : `Copy ${slides.length} slides to the library`, (close, setError) => [
    h('p', { class: 'slipr-help' }, ['The library is kept in this browser, for all your shows. A copy keeps the slide, its pictures and files, its reader layer and the glossary terms it uses; later changes to the slide do not change the copy.']),
    h('form', {
      class: 'slipr-dialog-form',
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        try {
          const collection = await chosenCollection(library, select, newName);
          const { count, missing } = await copyToLibrary(store, library, slideIds, {
            title: single ? title.value : undefined, tags: cleanTags(tags.value), note: note.value, collection,
          });
          close();
          showBanner(`${plural(count, 'slide')} copied to the library.${missing.length ? ` Not found, so not copied: ${missing.join(', ')}.` : ''}`, missing.length ? 'info' : 'success', { timeout: missing.length ? 10000 : 4000 });
          onDone?.();
        } catch (err) {
          setError(`The library could not be saved: ${err instanceof Error ? err.message : err}`);
        }
      },
    }, [
      single ? h('label', { class: 'slipr-label' }, ['Title', title]) : h('p', {}, [`Each slide keeps its own title: ${slides.map(defaultTitle).join(', ')}.`]),
      h('label', { class: 'slipr-label' }, ['Tags (separated by commas)', tags]),
      h('label', { class: 'slipr-label' }, ['Note', note]),
      h('label', { class: 'slipr-label' }, ['Collection', select]),
      newName,
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
        h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary' }, ['Copy to library']),
      ]),
    ]),
  ]);
  (single ? title : tags).focus();
}

/** @param {any} slide */
function defaultTitle(slide) {
  const c = slide?.content ?? {};
  for (const key of ['title', 'heading', 'caption']) if (typeof c[key] === 'string' && c[key].trim()) return c[key].trim();
  return slide?.id ?? 'Slide';
}

/**
 * Browse the library, insert slides, and manage it.
 * @param {{ store: EditorStore }} options
 */
export async function openLibraryDialog({ store }) {
  const library = await getLibrary();
  /** @type {LibraryEntry[]} */
  let entries = await library.entries();
  /** @type {LibraryCollection[]} */
  let collections = await library.collections();
  /** @type {import('../library/library-model.js').LibraryFilter} */
  const filter = { query: '', tags: [], collection: undefined, template: null, showId: null, sort: 'manual' };
  /** @type {Set<string>} */
  const selected = new Set();
  /** @type {string | null} */
  let focusId = null;
  /** Object URLs of entry files, per entry (made when its thumbnail is drawn). */
  /** @type {Map<string, Map<string, string>>} */
  const urls = new Map();
  /** @type {string | null} */
  let dragId = null;

  const grid = h('div', { class: 'slipr-library-grid', role: 'list', 'aria-label': 'Library slides' });
  const side = h('aside', { class: 'slipr-library-side', 'aria-label': 'The selected library slide' });
  const filters = h('div', { class: 'slipr-library-filters' });
  const tagBar = h('div', { class: 'slipr-library-tags', role: 'group', 'aria-label': 'Filter by tag' });
  const insertBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'slipr-btn slipr-btn-primary', disabled: true }, ['Insert']));
  const status = h('p', { class: 'slipr-library-status', 'aria-live': 'polite' });
  const say = (/** @type {string} */ text) => { status.textContent = text; };

  const reload = async () => {
    entries = await library.entries();
    collections = await library.collections();
    for (const id of [...selected]) if (!entries.some((e) => e.id === id)) selected.delete(id);
    if (focusId && !entries.some((e) => e.id === focusId)) focusId = null;
    render();
  };

  const current = () => store.state.selectedSlideId;
  const currentTitle = () => {
    const s = (store.state.show?.slides ?? []).find((/** @type {any} */ x) => x.id === current());
    return s ? defaultTitle(s) : null;
  };

  /** @param {LibraryEntry} entry */
  const entryUrls = async (entry) => {
    let map = urls.get(entry.id);
    if (map) return map;
    map = new Map();
    urls.set(entry.id, map);
    for (const f of entry.files) {
      const blob = await library.file(f.hash);
      if (blob) map.set(f.path, URL.createObjectURL(blob));
    }
    return map;
  };

  /** The slide as it would be inserted here, drawn with the open show's template. @param {LibraryEntry} entry @param {HTMLElement} host */
  const drawThumb = async (entry, host) => {
    const state = store.state;
    const map = await entryUrls(entry);
    try {
      const { slides } = prepareInsert([entry], { show: state.show, template: state.template, newId: () => `lib-preview-${entry.id}` });
      const slide = { ...slides[0], audience: { ...(slides[0].audience ?? {}) } };
      const el = renderSlide(slide, {
        show: state.show, template: state.template, layouts: state.layouts, validation: state.validation,
        resolveAsset: (/** @type {string} */ p) => map.get(p) ?? state.resolveAsset?.(p) ?? p,
        resolveTemplateAsset: state.resolveTemplateAsset,
      }, { mode: 'audience' });
      host.replaceChildren(el);
      hydrateEmbeds(el, { thumbnail: true }).catch(() => {});
    } catch (err) {
      host.replaceChildren(h('span', { class: 'slipr-layout-thumb-error' }, ['No preview']));
      console.warn('Slipr: no preview for library slide', entry.id, err);
    }
  };

  const visible = () => filterEntries(entries, filter, collections);

  function renderFilters() {
    const templates = [...new Map(entries.map((e) => [e.source?.template?.id, e.source?.template?.name ?? e.source?.template?.id])).entries()].filter(([id]) => id);
    const shows = [...new Map(entries.map((e) => [e.source?.showId, e.source?.showTitle ?? e.source?.showId])).entries()].filter(([id]) => id);
    const search = /** @type {HTMLInputElement} */ (h('input', {
      class: 'slipr-input', type: 'search', placeholder: 'Search titles, tags, notes and slide text', value: filter.query, 'aria-label': 'Search the library',
      oninput: () => { filter.query = search.value; renderGrid(); },
    }));
    /** @param {string} label @param {[string, string][]} options @param {string} value @param {(v: string) => void} set */
    const select = (label, options, value, set) => {
      const el = /** @type {HTMLSelectElement} */ (h('select', { class: 'slipr-select', 'aria-label': label, onchange: () => { set(el.value); render(); } },
        options.map(([v, text]) => h('option', { value: v, selected: v === value ? true : undefined }, [text]))));
      return el;
    };
    filters.replaceChildren(...[
      search,
      select('Collection', [['__all', 'All collections'], ['', 'No collection'], ...collections.map((c) => /** @type {[string, string]} */ ([c.id, c.name]))],
        filter.collection === undefined || filter.collection === null ? '__all' : filter.collection, (v) => { filter.collection = v === '__all' ? undefined : v; }),
      templates.length > 1 ? select('Template', [['', 'All templates'], ...templates.map(([id, name]) => /** @type {[string, string]} */ ([String(id), `Template: ${name}`]))],
        filter.template ?? '', (v) => { filter.template = v || null; }) : null,
      shows.length > 1 ? select('Copied from', [['', 'From any show'], ...shows.map(([id, name]) => /** @type {[string, string]} */ ([String(id), `From: ${name}`]))],
        filter.showId ?? '', (v) => { filter.showId = v || null; }) : null,
      select('Sort', [['manual', 'My order'], ['newest', 'Newest first'], ['title', 'By title']], filter.sort ?? 'manual', (v) => { filter.sort = /** @type {any} */ (v); }),
    ].filter((x) => x !== null));
    const tags = libraryTags(entries);
    tagBar.replaceChildren(...tags.map((tag) => h('button', {
      type: 'button', class: 'slipr-library-tag', 'aria-pressed': String(filter.tags?.includes(tag) ?? false),
      onclick: () => {
        filter.tags = filter.tags?.includes(tag) ? filter.tags.filter((t) => t !== tag) : [...(filter.tags ?? []), tag];
        render();
      },
    }, [tag])));
    tagBar.hidden = !tags.length;
  }

  function renderGrid() {
    const list = visible();
    const ownTemplate = store.state.template?.id ?? null;
    if (!entries.length) {
      grid.replaceChildren(h('div', { class: 'slipr-library-empty' }, [
        h('p', {}, [h('strong', {}, ['The library is empty.'])]),
        h('p', {}, ['Copy slides into it with ', h('strong', {}, ['Copy current slide']), ' below, or select slides in the show grid (▦) and choose ', h('strong', {}, ['Copy to library…']), '. They are then available in every show you open in this browser.']),
      ]));
    } else if (!list.length) {
      grid.replaceChildren(h('p', { class: 'slipr-library-empty' }, ['No library slides match. Clear the search or the filters.']));
    } else {
      const canDrag = (filter.sort ?? 'manual') === 'manual';
      grid.replaceChildren(...list.map((entry) => {
        const thumb = h('div', { class: 'slipr-grid-thumb slipr-library-thumb', 'aria-hidden': 'true' });
        thumb.inert = true;
        drawThumb(entry, thumb);
        const isSelected = selected.has(entry.id);
        const otherTemplate = entry.source?.template?.id && entry.source.template.id !== ownTemplate;
        const collection = collections.find((c) => c.id === entry.collection);
        const card = h('div', {
          class: `slipr-library-card ${isSelected ? 'is-selected' : ''} ${focusId === entry.id ? 'is-focused' : ''}`,
          role: 'listitem', draggable: canDrag ? 'true' : undefined, 'data-entry-id': entry.id,
        }, [
          h('button', {
            type: 'button', class: 'slipr-library-pick', 'aria-pressed': String(isSelected),
            'aria-label': `${entry.title}${isSelected ? ', selected' : ''}`,
            title: 'Click to select (for Insert) and show its details; click again to unselect',
            onclick: () => {
              if (selected.has(entry.id)) selected.delete(entry.id);
              else selected.add(entry.id);
              focusId = entry.id;
              render();
            },
          }, [
            thumb,
            h('span', { class: 'slipr-library-title' }, [entry.title]),
            h('span', { class: 'slipr-library-meta' }, [
              entry.source?.showTitle ? `From “${entry.source.showTitle}”` : 'From an unnamed show',
              collection ? ` · ${collection.name}` : '',
            ]),
            entry.tags.length ? h('span', { class: 'slipr-library-card-tags' }, entry.tags.map((t) => h('span', { class: 'slipr-library-chip' }, [t]))) : null,
            otherTemplate ? h('span', { class: 'slipr-grid-badge', title: 'Made with another template' }, [`${entry.source.template.name ?? entry.source.template.id} template`]) : null,
            ...landingBadges(entry),
          ]),
        ]);
        if (canDrag) {
          card.addEventListener('dragstart', (e) => {
            dragId = entry.id;
            e.dataTransfer?.setData('text/plain', entry.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          });
          card.addEventListener('dragover', (e) => {
            const from = entries.find((x) => x.id === dragId);
            if (!from || from.id === entry.id || (from.collection ?? null) !== (entry.collection ?? null)) return;
            e.preventDefault();
            card.classList.add('is-drop-target');
          });
          card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
          card.addEventListener('drop', async (e) => {
            e.preventDefault();
            card.classList.remove('is-drop-target');
            if (!dragId) return;
            const group = entries.filter((x) => (x.collection ?? null) === (entry.collection ?? null)).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
            await move(dragId, group.findIndex((x) => x.id === entry.id), true);
            dragId = null;
          });
          card.addEventListener('dragend', () => { dragId = null; });
        }
        return card;
      }));
    }
    const n = [...selected].filter((id) => entries.some((e) => e.id === id)).length;
    const where = currentTitle();
    insertBtn.disabled = !n;
    insertBtn.textContent = n ? `Insert ${plural(n, 'slide')}${where ? ` after “${truncate(where, 28)}”` : ''}` : 'Insert';
  }

  /** What happens to an entry's layout in this show, as badges. @param {LibraryEntry} entry */
  function landingBadges(entry) {
    const { layout, switched, aside } = landing(entry, store.state.template);
    const name = store.state.template?.layouts?.find((/** @type {any} */ l) => l.id === layout)?.name ?? layout;
    return [
      switched ? h('span', { class: 'slipr-grid-badge is-warning', title: 'This template has no such layout; the slide gets the closest one' }, [`Becomes: ${name}`]) : null,
      aside.length ? h('span', { class: 'slipr-grid-badge is-warning', title: 'Content with no place in that layout is kept aside (it comes back when you pick a layout that has it)' }, [`Kept aside: ${aside.join(', ')}`]) : null,
    ];
  }

  /** Move an entry within its collection. @param {string} id @param {number} delta @param {boolean} [absolute] */
  async function move(id, delta, absolute = false) {
    const changes = reorderEntries(entries, id, delta, { absolute });
    if (!changes.length) return;
    await library.save(changes.map((c) => ({ .../** @type {LibraryEntry} */ (entries.find((e) => e.id === c.id)), order: c.order })));
    await reload();
    say('Moved.');
  }

  function renderSide() {
    const entry = entries.find((e) => e.id === focusId);
    if (!entry) {
      side.replaceChildren(h('p', { class: 'slipr-help' }, [
        entries.length ? 'Click a slide to select it for Insert and to see and change its details here. Select several to insert them together, in library order.' : '',
      ]));
      return;
    }
    const title = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', value: entry.title }));
    const tags = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', value: entry.tags.join(', ') }));
    const note = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'slipr-textarea', rows: 3 }, [entry.note]));
    const select = collectionSelect(collections, entry.collection, 'Collection');
    const newName = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', placeholder: 'Name of the new collection', hidden: true }));
    select.addEventListener('change', () => { newName.hidden = select.value !== '__new'; });
    const source = entry.source ?? {};
    const date = new Date(entry.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const manual = (filter.sort ?? 'manual') === 'manual';
    const slideNow = currentTitle();
    side.replaceChildren(
      h('form', {
        class: 'slipr-dialog-form slipr-library-form',
        onsubmit: async (/** @type {Event} */ e) => {
          e.preventDefault();
          const collection = await chosenCollection(library, select, newName);
          await library.save([{ ...entry, title: title.value.trim() || entry.title, tags: cleanTags(tags.value), note: note.value, collection,
            order: collection === entry.collection ? entry.order : Date.now() }]);
          await reload();
          say('Saved.');
        },
      }, [
        h('label', { class: 'slipr-label' }, ['Title', title]),
        h('label', { class: 'slipr-label' }, ['Tags (separated by commas)', tags]),
        h('label', { class: 'slipr-label' }, ['Note', note]),
        h('label', { class: 'slipr-label' }, ['Collection', select]),
        newName,
        h('div', { class: 'slipr-library-row' }, [
          h('button', { type: 'submit', class: 'slipr-btn slipr-btn-sm slipr-btn-primary' }, ['Save details']),
          manual ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Move earlier in its collection', 'aria-label': 'Move earlier', onclick: () => move(entry.id, -1) }, ['▲']) : null,
          manual ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Move later in its collection', 'aria-label': 'Move later', onclick: () => move(entry.id, 1) }, ['▼']) : null,
        ]),
      ]),
      h('p', { class: 'slipr-help' }, [
        `Copied ${date} from “${source.showTitle ?? 'an unnamed show'}”`,
        source.template?.id ? ` (template ${source.template.name ?? source.template.id}${source.template.version ? ` ${source.template.version}` : ''})` : '',
        `. ${plural(entry.files.length, 'file')}`,
        Object.keys(entry.glossary ?? {}).length ? `, ${plural(Object.keys(entry.glossary).length, 'glossary term')}` : '',
        '.',
      ]),
      h('div', { class: 'slipr-library-row' }, [
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !slideNow,
          title: slideNow ? `Replace this library slide with the current slide, “${slideNow}” (title, tags, note and collection stay)` : 'Select a slide in the editor first',
          onclick: () => {
            if (!slideNow || !confirm(`Replace “${entry.title}” in the library with the current slide, “${slideNow}”? Title, tags, note and collection stay.`)) return;
            updateFromSlide(store, library, entry, /** @type {string} */ (current())).then(({ missing }) => {
              urls.get(entry.id)?.forEach((u) => URL.revokeObjectURL(u));
              urls.delete(entry.id);
              say(`Updated from “${slideNow}”.${missing.length ? ` Not found: ${missing.join(', ')}.` : ''}`);
              return reload();
            }).catch((err) => say(`Not updated: ${err.message}`));
          },
        }, ['Update from current slide']),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger',
          onclick: async () => {
            if (!confirm(`Remove “${entry.title}” from the library? Shows that use it keep their copy.`)) return;
            await library.remove([entry.id]);
            selected.delete(entry.id);
            focusId = null;
            await reload();
            say('Removed from the library.');
          },
        }, ['Remove from library']),
      ]),
    );
  }

  function render() {
    renderFilters();
    renderGrid();
    renderSide();
  }

  /** Collections: new, rename, remove, order. */
  function openCollections() {
    openDialog('Collections', (close) => {
      const list = h('ul', { class: 'slipr-library-collections' });
      const draw = () => {
        list.replaceChildren(...collections.map((c, i) => {
          const name = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input slipr-input-sm', type: 'text', value: c.name, 'aria-label': 'Collection name' }));
          name.addEventListener('change', async () => {
            if (!name.value.trim()) return;
            await library.saveCollection({ ...c, name: name.value.trim() });
            await reload();
            draw();
          });
          const swap = async (/** @type {number} */ d) => {
            const other = collections[i + d];
            if (!other) return;
            await library.saveCollection({ ...c, order: i + d + 1 });
            await library.saveCollection({ ...other, order: i + 1 });
            await reload();
            draw();
          };
          const count = entries.filter((e) => e.collection === c.id).length;
          return h('li', {}, [
            name,
            h('span', { class: 'slipr-help' }, [plural(count, 'slide')]),
            h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${c.name} up`, disabled: i === 0, onclick: () => swap(-1) }, ['▲']),
            h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${c.name} down`, disabled: i === collections.length - 1, onclick: () => swap(1) }, ['▼']),
            h('button', {
              type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger',
              onclick: async () => {
                if (!confirm(`Remove the collection “${c.name}”? Its ${plural(count, 'slide')} stay in the library, in no collection.`)) return;
                await library.removeCollection(c.id);
                if (filter.collection === c.id) filter.collection = undefined;
                await reload();
                draw();
              },
            }, ['Remove']),
          ]);
        }));
        if (!collections.length) list.replaceChildren(h('li', { class: 'slipr-help' }, ['No collections yet.']));
      };
      draw();
      const newName = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', type: 'text', placeholder: 'New collection name', 'aria-label': 'New collection name' }));
      return [
        h('p', { class: 'slipr-help' }, ['A collection groups library slides, like a folder; a slide is in at most one. Tags work across collections.']),
        list,
        h('form', {
          class: 'slipr-library-row',
          onsubmit: async (/** @type {Event} */ e) => {
            e.preventDefault();
            const name = newName.value.trim();
            if (!name) return;
            await library.saveCollection({ id: newLibraryId('col-'), name, order: collections.length + 1 });
            newName.value = '';
            await reload();
            draw();
          },
        }, [newName, h('button', { type: 'submit', class: 'slipr-btn slipr-btn-sm' }, ['Add collection'])]),
        h('div', { class: 'slipr-dialog-actions' }, [h('button', { type: 'button', class: 'slipr-btn slipr-btn-primary', onclick: close }, ['Done'])]),
      ];
    });
  }

  async function exportLibrary() {
    const ids = selected.size ? [...selected] : undefined;
    try {
      const { bytes, count, missing } = await library.exportZip(ids);
      const name = `slipr-library-${new Date().toISOString().slice(0, 10)}.zip`;
      const blob = new Blob([bytes], { type: 'application/zip' });
      const picker = /** @type {any} */ (window).showSaveFilePicker;
      if (typeof picker === 'function') {
        let handle;
        try {
          handle = await picker({ suggestedName: name, id: 'slipr-library', types: [{ description: 'Slipr slide library (.zip)', accept: { 'application/zip': ['.zip'] } }] });
        } catch (err) {
          if (/** @type {any} */ (err)?.name === 'AbortError') return;
          throw err;
        }
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      say(`Exported ${plural(count, 'library slide')}${ids ? ' (the selected ones)' : ''}.${missing ? ` ${plural(missing, 'file')} could not be found.` : ''}`);
    } catch (err) {
      say(`Export failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function importLibrary() {
    const file = await pickZipFile();
    if (!file) return;
    try {
      const { added, replaced, skipped } = await library.importZip(await file.arrayBuffer());
      await reload();
      say(`Imported: ${plural(added, 'new slide')}, ${replaced} updated, ${skipped} already here.`);
    } catch (err) {
      say(`Import failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  insertBtn.addEventListener('click', async () => {
    const chosen = visible().filter((e) => selected.has(e.id));
    const rest = entries.filter((e) => selected.has(e.id) && !chosen.includes(e)); // selected but filtered out
    const list = [...chosen, ...rest];
    if (!list.length) return;
    insertBtn.disabled = true;
    try {
      const { slideIds, notices } = await insertFromLibrary(store, library, list, current());
      dialog.close();
      showBanner(`${plural(slideIds.length, 'slide')} inserted from the library. ${notices.join(' ')}`.trim(), notices.length ? 'info' : 'success', { timeout: notices.length ? 15000 : 4000 });
    } catch (err) {
      insertBtn.disabled = false;
      say(`Not inserted: ${err instanceof Error ? err.message : err}`);
    }
  });

  const dialog = openDialog('Slide library', (close) => [
    h('div', { class: 'slipr-library' }, [
      filters,
      tagBar,
      h('div', { class: 'slipr-library-body' }, [grid, side]),
    ]),
    status,
    h('div', { class: 'slipr-dialog-actions slipr-library-actions' }, [
      h('button', {
        type: 'button', class: 'slipr-btn', title: 'Copy the slide selected in the editor into the library',
        onclick: () => {
          const id = current();
          if (id) openCopyToLibraryDialog({ store, slideIds: [id], onDone: () => reload() });
        },
      }, ['Copy current slide…']),
      h('button', { type: 'button', class: 'slipr-btn', onclick: openCollections }, ['Collections…']),
      h('button', { type: 'button', class: 'slipr-btn', title: 'Save the library (or the selected slides) as a zip file, as a backup or for another browser', onclick: exportLibrary }, ['Export…']),
      h('button', { type: 'button', class: 'slipr-btn', title: 'Add the slides of a library zip file', onclick: importLibrary }, ['Import…']),
      h('span', { class: 'slipr-library-spacer' }),
      h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Close']),
      insertBtn,
    ]),
  ], { wide: true });
  dialog.classList.add('slipr-library-dialog');
  dialog.addEventListener('close', () => {
    for (const map of urls.values()) for (const u of map.values()) URL.revokeObjectURL(u);
  });
  render();
  /** @type {HTMLInputElement | null} */ (filters.querySelector('input[type="search"]'))?.focus();
}

/** @param {string} text @param {number} max */
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
