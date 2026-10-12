// @ts-check
/**
 * Editor show settings tab: metadata, global presentation settings,
 * chapters, glossary, profiles, and curated paths.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { slideTitle } from '../../../shared/render.js';
import { chapterUsage, glossaryReferences, isIsoDate, isLanguageTag, parseTags, profileUsage, uniqueId } from '../show-entities.js';
import { openConfirmDialog } from './dialogs.js';
import { markdownToolbar } from './markdown-toolbar.js';

/** Actions the settings form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['setMeta', 'setSettings', 'upsertChapter', 'upsertProfile', 'upsertGlossaryTerm', 'upsertPath']);

/**
 * Mount the show settings panel into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountShowSettings(container, store) {
  const root = h('div', { class: 'slipr-show-settings-panel' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const show = state.show ?? {};
    const meta = show.meta ?? {};
    const settings = show.settings ?? {};

    const heading = h('h2', { class: 'slipr-panel-title' }, ['Show Settings']);

    // Meta section
    const metaSection = h('fieldset', { class: 'slipr-fieldset' }, [
      h('legend', {}, ['Metadata']),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Show Title']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.title ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { title: /** @type {HTMLInputElement} */ (e.target).value }, {
              coalesceKey: 'meta-title',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Subtitle']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.subtitle ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { subtitle: /** @type {HTMLInputElement} */ (e.target).value || undefined }, {
              coalesceKey: 'meta-subtitle',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Author']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.author ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { author: /** @type {HTMLInputElement} */ (e.target).value || undefined }, {
              coalesceKey: 'meta-author',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Date']),
        h('input', {
          type: 'date',
          class: 'slipr-input',
          value: meta.date ?? '',
          oninput: (e) => {
            const input = /** @type {HTMLInputElement} */ (e.target);
            const ok = input.value === '' || isIsoDate(input.value);
            input.setAttribute('aria-invalid', ok ? 'false' : 'true');
            if (ok) store.dispatch('setMeta', { date: input.value || undefined }, { coalesceKey: 'meta-date' });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label', for: 'slipr-meta-language' }, ['Language']),
        h('input', {
          type: 'text',
          id: 'slipr-meta-language',
          class: 'slipr-input',
          placeholder: 'en, nl, nl-NL…',
          value: meta.language ?? '',
          oninput: (e) => {
            const input = /** @type {HTMLInputElement} */ (e.target);
            const value = input.value.trim();
            const ok = value === '' || isLanguageTag(value);
            input.setAttribute('aria-invalid', ok ? 'false' : 'true');
            if (ok) store.dispatch('setMeta', { language: value || undefined }, { coalesceKey: 'meta-language' });
          },
        }),
        h('span', { class: 'slipr-help' }, ['The language of the show (a language code). Used for hyphenation, screen readers and spelling.']),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label', for: 'slipr-meta-description' }, ['Description']),
        h('textarea', {
          id: 'slipr-meta-description',
          class: 'slipr-textarea slipr-textarea-sm',
          placeholder: 'One or two sentences about the show (reader welcome, link previews)',
          oninput: (e) => store.dispatch('setMeta', { description: /** @type {HTMLTextAreaElement} */ (e.target).value || undefined }, { coalesceKey: 'meta-description' }),
        }, [meta.description ?? '']),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label', for: 'slipr-meta-tags' }, ['Tags']),
        h('input', {
          type: 'text',
          id: 'slipr-meta-tags',
          class: 'slipr-input',
          placeholder: 'Comma-separated',
          value: (meta.tags ?? []).join(', '),
          oninput: (e) => {
            const tags = parseTags(/** @type {HTMLInputElement} */ (e.target).value);
            store.dispatch('setMeta', { tags: tags.length ? tags : undefined }, { coalesceKey: 'meta-tags' });
          },
        }),
      ]),
    ]);

    // Presentation Settings
    const settingsSection = h('fieldset', { class: 'slipr-fieldset' }, [
      h('legend', {}, ['Audience Presentation Settings']),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Aspect Ratio']),
        h(
          'select',
          {
            class: 'slipr-select',
            onchange: (e) => {
              store.dispatch('setSettings', { aspectRatio: /** @type {HTMLSelectElement} */ (e.target).value });
            },
          },
          [
            h('option', { value: '16:9', selected: settings.aspectRatio === '16:9' ? true : undefined }, ['16:9 (Standard Widescreen)']),
            h('option', { value: '4:3', selected: settings.aspectRatio === '4:3' ? true : undefined }, ['4:3 (Traditional)']),
          ]
        ),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Slide Transition']),
        h(
          'select',
          {
            class: 'slipr-select',
            onchange: (e) => {
              store.dispatch('setSettings', { transition: /** @type {HTMLSelectElement} */ (e.target).value || undefined });
            },
          },
          [
            h('option', { value: '', selected: settings.transition ? undefined : true }, ['Reveal default']),
            ...['none', 'fade', 'slide', 'convex', 'concave', 'zoom'].map((t) => h('option', { value: t, selected: settings.transition === t ? true : undefined }, [t.charAt(0).toUpperCase() + t.slice(1)])),
          ]
        ),
      ]),
      h('div', { class: 'slipr-form-checkbox' }, [
        h('label', {}, [
          h('input', {
            type: 'checkbox',
            checked: Boolean(settings.slideNumbers),
            onchange: (e) => store.dispatch('setSettings', { slideNumbers: /** @type {HTMLInputElement} */ (e.target).checked || undefined }),
          }),
          ' Show slide numbers',
        ]),
      ]),
      h('div', { class: 'slipr-form-checkbox' }, [
        h('label', {}, [
          h('input', {
            type: 'checkbox',
            checked: Boolean(settings.agenda),
            onchange: (e) => store.dispatch('setSettings', { agenda: /** @type {HTMLInputElement} */ (e.target).checked || undefined }),
          }),
          ' Agenda slide before each chapter (generated from the chapters)',
        ]),
      ]),
    ]);

    root.append(
      heading,
      metaSection,
      settingsSection,
      chaptersSection(store, show),
      profilesSection(store, show),
      glossarySection(store, show),
      pathsSection(store, show)
    );
  }

  store.subscribe((event) => {
    if (event.changedKeys.includes('show')) {
      // Leave the form alone while it echoes the user's own typing; re-render for anything else.
      if (isTypingEcho(root, event, TYPING_ACTIONS)) return;
      rerenderKeepingFocus(root, render);
    }
  });

  render();
}

// ---------------------------------------------------------------------------
// Chapters, profiles, glossary and reading routes (E-009)
// ---------------------------------------------------------------------------

/**
 * Focus (and select) the first input of a newly added item after the re-render.
 * @param {string} key  `${list}:${id}`
 */
function focusNew(key) {
  queueMicrotask(() => {
    const el = document.querySelector(`[data-entity-focus="${CSS.escape(key)}"]`);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  });
}

/**
 * A text input for a required field: an empty value is not stored (the field is
 * marked instead), so the show never gets an invalid empty title or label.
 * @param {{ value: string, label: string, focusKey?: string, onValue: (value: string) => void }} options
 */
function requiredInput({ value, label, focusKey, onValue }) {
  return h('input', {
    type: 'text',
    class: 'slipr-input slipr-input-sm',
    value,
    'aria-label': label,
    'data-entity-focus': focusKey,
    oninput: (/** @type {Event} */ e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const empty = input.value.trim() === '';
      input.setAttribute('aria-invalid', empty ? 'true' : 'false');
      if (!empty) onValue(input.value);
    },
  });
}

/**
 * An optional text input; empty removes the field.
 * @param {{ value?: string, label: string, placeholder?: string, onValue: (value: string | undefined) => void }} options
 */
function optionalInput({ value, label, placeholder, onValue }) {
  return h('input', {
    type: 'text',
    class: 'slipr-input slipr-input-sm',
    value: value ?? '',
    placeholder,
    'aria-label': label,
    oninput: (/** @type {Event} */ e) => onValue(/** @type {HTMLInputElement} */ (e.target).value || undefined),
  });
}

/**
 * Move up / down / delete buttons for an item of a show list.
 * @param {import('../store.js').EditorStore} store
 * @param {'chapters' | 'profiles' | 'paths' | null} list  null: no reordering (glossary).
 * @param {string} id @param {number} index @param {number} count @param {string} name
 * @param {() => void} onDelete
 */
function itemTools(store, list, id, index, count, name, onDelete) {
  return h('div', { class: 'slipr-entity-tools' }, [
    list ? h('button', {
      type: 'button', class: 'slipr-item-btn', title: 'Move up', 'aria-label': `Move ${name} up`,
      disabled: index === 0 ? true : undefined,
      onclick: () => store.dispatch('moveShowItem', { list, id, toIndex: index - 1 }),
    }, ['▲']) : null,
    list ? h('button', {
      type: 'button', class: 'slipr-item-btn', title: 'Move down', 'aria-label': `Move ${name} down`,
      disabled: index === count - 1 ? true : undefined,
      onclick: () => store.dispatch('moveShowItem', { list, id, toIndex: index + 1 }),
    }, ['▼']) : null,
    h('button', {
      type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Delete', 'aria-label': `Delete ${name}`,
      onclick: onDelete,
    }, ['🗑']),
  ]);
}

/**
 * @param {string} legend @param {string} help @param {string} addLabel @param {() => void} onAdd @param {HTMLElement[]} items
 */
function entitySection(legend, help, addLabel, onAdd, items) {
  return h('fieldset', { class: 'slipr-fieldset' }, [
    h('legend', {}, [legend]),
    h('p', { class: 'slipr-help' }, [help]),
    items.length ? h('div', { class: 'slipr-entity-list' }, items) : null,
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: onAdd }, [addLabel]),
  ]);
}

/**
 * @param {import('../store.js').EditorStore} store
 * @param {any} show
 */
function chaptersSection(store, show) {
  const chapters = Array.isArray(show.chapters) ? show.chapters : [];
  const items = chapters.map((/** @type {any} */ chap, /** @type {number} */ i) => {
    const used = chapterUsage(show, chap.id);
    return h('div', { class: 'slipr-entity-card' }, [
      h('div', { class: 'slipr-entity-row' }, [
        requiredInput({
          value: chap.title, label: `Chapter ${i + 1}: title`, focusKey: `chapters:${chap.id}`,
          onValue: (title) => store.dispatch('upsertChapter', { id: chap.id, title }, { coalesceKey: `chapter-title-${chap.id}` }),
        }),
        itemTools(store, 'chapters', chap.id, i, chapters.length, `chapter "${chap.title}"`, () => {
          const remove = () => store.dispatch('deleteChapter', { chapterId: chap.id });
          if (!used) return remove();
          openConfirmDialog({
            title: `Delete chapter "${chap.title}"?`,
            text: `${used} slide${used === 1 ? '' : 's'} belong${used === 1 ? 's' : ''} to this chapter. They stay, without a chapter.`,
            actions: [{ label: 'Delete chapter', kind: 'danger', run: remove }],
          });
        }),
      ]),
      optionalInput({
        value: chap.summary, label: `Chapter ${i + 1}: summary`, placeholder: 'Summary (shown in the reader contents; optional)',
        onValue: (summary) => store.dispatch('upsertChapter', { id: chap.id, summary }, { coalesceKey: `chapter-summary-${chap.id}` }),
      }),
      h('span', { class: 'slipr-help' }, [`${used} slide${used === 1 ? '' : 's'}`]),
    ]);
  });
  return entitySection(
    `Chapters (${chapters.length})`,
    'Chapters group slides: the agenda in audience mode and the contents in reader mode follow this order. Assign a slide to a chapter in its Slide tab.',
    '+ Add chapter',
    () => {
      const id = uniqueId('New chapter', chapters.map((/** @type {any} */ c) => c.id), 'chapter');
      store.dispatch('upsertChapter', { id, title: 'New chapter' });
      focusNew(`chapters:${id}`);
    },
    items
  );
}

/**
 * @param {import('../store.js').EditorStore} store
 * @param {any} show
 */
function profilesSection(store, show) {
  const profiles = Array.isArray(show.profiles) ? show.profiles : [];
  const items = profiles.map((/** @type {any} */ profile, /** @type {number} */ i) => {
    const used = profileUsage(show, profile.id);
    return h('div', { class: 'slipr-entity-card' }, [
      h('div', { class: 'slipr-entity-row' }, [
        requiredInput({
          value: profile.label, label: `Profile ${i + 1}: name`, focusKey: `profiles:${profile.id}`,
          onValue: (label) => store.dispatch('upsertProfile', { id: profile.id, label }, { coalesceKey: `profile-label-${profile.id}` }),
        }),
        itemTools(store, 'profiles', profile.id, i, profiles.length, `profile "${profile.label}"`, () => {
          const remove = () => store.dispatch('deleteProfile', { profileId: profile.id });
          if (!used) return remove();
          openConfirmDialog({
            title: `Delete profile "${profile.label}"?`,
            text: `${used} reader block${used === 1 ? ' is' : 's are'} meant for this profile. The profile is removed from ${used === 1 ? 'it' : 'them'}; a block meant only for this profile becomes visible to every reader.`,
            actions: [{ label: 'Delete profile', kind: 'danger', run: remove }],
          });
        }),
      ]),
      optionalInput({
        value: profile.description, label: `Profile ${i + 1}: description`, placeholder: 'Description (shown when readers choose; optional)',
        onValue: (description) => store.dispatch('upsertProfile', { id: profile.id, description }, { coalesceKey: `profile-description-${profile.id}` }),
      }),
      h('span', { class: 'slipr-help' }, [`Id "${profile.id}" · ${used} block${used === 1 ? '' : 's'} tailored for it`]),
    ]);
  });
  return entitySection(
    `Profiles (${profiles.length})`,
    'Kinds of readers (for example Developer, Manager). Readers pick one, and blocks meant for other profiles are hidden. Choose them per block with "For" in the Reader tab.',
    '+ Add profile',
    () => {
      const id = uniqueId('New profile', profiles.map((/** @type {any} */ p) => p.id), 'profile');
      store.dispatch('upsertProfile', { id, label: 'New profile' });
      focusNew(`profiles:${id}`);
    },
    items
  );
}

/**
 * @param {import('../store.js').EditorStore} store
 * @param {any} show
 */
function glossarySection(store, show) {
  const entries = Object.entries(show.glossary && typeof show.glossary === 'object' ? show.glossary : {});
  const items = entries.map(([id, entry]) => {
    const term = /** @type {any} */ (entry);
    const refs = glossaryReferences(show, id);
    const uses = refs.reduce((n, r) => n + r.count, 0);
    /** @param {Record<string, any>} patch */
    const update = (patch, /** @type {string} */ key) => {
      const current = store.state.show?.glossary?.[id] ?? term;
      store.dispatch('upsertGlossaryTerm', { id, term: current.term, aliases: current.aliases, definition: current.definition ?? '', link: current.link, ...patch }, { coalesceKey: `glossary-${key}-${id}` });
    };
    const definition = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'slipr-textarea slipr-textarea-sm',
      placeholder: 'Definition (Markdown), shown in a popup in reader mode',
      'aria-label': `Glossary "${term.term}": definition`,
      oninput: (/** @type {Event} */ e) => update({ definition: /** @type {HTMLTextAreaElement} */ (e.target).value }, 'definition'),
    }, [term.definition ?? '']));
    return h('div', { class: 'slipr-entity-card' }, [
      h('div', { class: 'slipr-entity-row' }, [
        requiredInput({
          value: term.term, label: `Glossary term "${id}"`, focusKey: `glossary:${id}`,
          onValue: (value) => update({ term: value }, 'term'),
        }),
        itemTools(store, null, id, 0, 1, `glossary term "${term.term}"`, () => {
          if (!uses) return store.dispatch('deleteGlossaryTerm', { id });
          openConfirmDialog({
            title: `Delete "${term.term}" from the glossary?`,
            text: `It is used ${uses} time${uses === 1 ? '' : 's'}:`,
            items: refs.map((r) => (r.count > 1 ? `${r.where} (${r.count}×)` : r.where)),
            actions: [
              { label: 'Delete, leave the references', run: () => store.dispatch('deleteGlossaryTerm', { id }) },
              { label: 'Delete, keep the words as plain text', kind: 'danger', run: () => store.dispatch('deleteGlossaryTerm', { id, unlink: true }) },
            ],
          });
        }),
      ]),
      // Other names (I-086): matched like the term in reader-mode slides, and found by search.
      optionalInput({
        value: Array.isArray(term.aliases) ? term.aliases.join(', ') : '',
        label: `Glossary "${term.term}": other names`,
        placeholder: 'Other names, comma-separated (optional): plurals, abbreviations',
        onValue: (text) => update({ aliases: text ?? '' }, 'aliases'),
      }),
      markdownToolbar(definition, { show, slideId: '' }),
      definition,
      optionalInput({
        value: term.link, label: `Glossary "${term.term}": link`, placeholder: 'Link for more information (optional)',
        onValue: (link) => update({ link }, 'link'),
      }),
      h('span', { class: 'slipr-help' }, [`Write [[${id}]] (or [[${id}|other words]]) in Markdown · used ${uses}×`]),
    ]);
  });
  return entitySection(
    `Glossary (${entries.length})`,
    'Terms readers can look up: a [[term]] reference in Markdown shows the definition in a popup in reader mode. Insert them with the "[[ ]] Term…" toolbar.',
    '+ Add term',
    () => {
      const id = uniqueId('New term', entries.map(([k]) => k), 'term');
      store.dispatch('upsertGlossaryTerm', { id, term: 'New term', definition: '' });
      focusNew(`glossary:${id}`);
    },
    items
  );
}

/**
 * @param {import('../store.js').EditorStore} store
 * @param {any} show
 */
function pathsSection(store, show) {
  const paths = Array.isArray(show.paths) ? show.paths : [];
  const slides = Array.isArray(show.slides) ? show.slides : [];
  const label = (/** @type {string} */ id) => {
    const i = slides.findIndex((/** @type {any} */ s) => s.id === id);
    return i === -1 ? `${id} (no such slide)` : `${i + 1}. ${slideTitle(slides[i]) || id}`;
  };

  const items = paths.map((/** @type {any} */ path, /** @type {number} */ i) => {
    const all = path.slides === '*';
    const list = Array.isArray(path.slides) ? path.slides : [];
    /** @param {string[] | '*'} next */
    const setSlides = (next) => store.dispatch('upsertPath', { id: path.id, slides: next });

    const allBox = h('label', { class: 'slipr-for-option' }, [
      h('input', {
        type: 'checkbox',
        checked: all,
        onchange: (/** @type {Event} */ e) => {
          // Unticking "all slides" starts from every slide in show order, to remove from.
          const on = /** @type {HTMLInputElement} */ (e.target).checked;
          setSlides(on ? '*' : slides.map((/** @type {any} */ s) => s.id));
        },
      }),
      ' All slides, in show order',
    ]);

    const slideItems = all ? [] : list.map((/** @type {string} */ id, /** @type {number} */ k) =>
      h('li', { class: `slipr-related-item ${slides.some((/** @type {any} */ s) => s.id === id) ? '' : 'is-unknown'}` }, [
        h('span', { class: 'slipr-related-title' }, [label(id)]),
        h('button', {
          type: 'button', class: 'slipr-item-btn', title: 'Move up', 'aria-label': `Move ${label(id)} up`,
          disabled: k === 0 ? true : undefined,
          onclick: () => setSlides(list.map((/** @type {string} */ x, /** @type {number} */ j) => (j === k - 1 ? id : j === k ? list[k - 1] : x))),
        }, ['▲']),
        h('button', {
          type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove from this route', 'aria-label': `Remove ${label(id)} from the route`,
          disabled: list.length <= 1 ? true : undefined,
          onclick: () => setSlides(list.filter((/** @type {string} */ _, /** @type {number} */ j) => j !== k)),
        }, ['✕']),
      ])
    );

    const candidates = slides.filter((/** @type {any} */ s) => !list.includes(s.id));
    const picker = all ? null : /** @type {HTMLSelectElement} */ (h('select', {
      class: 'slipr-select slipr-select-sm',
      'aria-label': `Add a slide to route "${path.label}"`,
      disabled: candidates.length ? undefined : true,
      onchange: (/** @type {Event} */ e) => {
        const id = /** @type {HTMLSelectElement} */ (e.target).value;
        if (id) setSlides([...list, id]);
      },
    }, [
      h('option', { value: '' }, ['+ Add slide…']),
      ...candidates.map((/** @type {any} */ s) => h('option', { value: s.id }, [label(s.id)])),
    ]));

    return h('div', { class: 'slipr-entity-card' }, [
      h('div', { class: 'slipr-entity-row' }, [
        requiredInput({
          value: path.label, label: `Route ${i + 1}: name`, focusKey: `paths:${path.id}`,
          onValue: (value) => store.dispatch('upsertPath', { id: path.id, label: value }, { coalesceKey: `path-label-${path.id}` }),
        }),
        itemTools(store, 'paths', path.id, i, paths.length, `route "${path.label}"`, () => store.dispatch('deletePath', { pathId: path.id })),
      ]),
      optionalInput({
        value: path.description, label: `Route ${i + 1}: description`, placeholder: 'Description (optional)',
        onValue: (description) => store.dispatch('upsertPath', { id: path.id, description }, { coalesceKey: `path-description-${path.id}` }),
      }),
      allBox,
      slideItems.length ? h('ol', { class: 'slipr-related-list' }, slideItems) : null,
      picker,
      h('span', { class: 'slipr-help' }, [all ? `${slides.length} slides` : `${list.length} of ${slides.length} slides`]),
    ]);
  });

  return entitySection(
    `Reading routes (${paths.length})`,
    'Curated routes through the show (for example a 5-minute overview). Readers can follow one instead of reading every slide.',
    '+ Add route',
    () => {
      const id = uniqueId('New route', paths.map((/** @type {any} */ p) => p.id), 'route');
      const first = store.state.selectedSlideId ?? slides[0]?.id;
      store.dispatch('upsertPath', { id, label: 'New route', slides: first ? [first] : '*' });
      focusNew(`paths:${id}`);
    },
    items
  );
}
