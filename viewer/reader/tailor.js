// @ts-check
/**
 * Choosing how to read: profile ("who are you?"), depth ("how deep?") and
 * path ("which route?"). One form, used in two places:
 *  - the first-visit welcome dialog
 *  - the "Tailor" panel in the top bar (changes apply immediately)
 */
import { h } from '../js/dom.js';

export const DEPTHS = [
  { value: 1, label: 'Overview', hint: 'The essentials only' },
  { value: 2, label: 'Standard', hint: 'The full story' },
  { value: 3, label: 'Deep dive', hint: 'Every detail' },
];

/**
 * @param {any} show
 * @param {import('./personalize.js').ReaderPrefs} prefs
 * @param {string} idPrefix  Keeps radio groups of several forms apart.
 * @returns {{ form: HTMLFormElement, read: () => import('./personalize.js').ReaderPrefs }}
 */
export function choicesForm(show, prefs, idPrefix) {
  const radio = (/** @type {string} */ name, /** @type {string} */ value, /** @type {boolean} */ checked, /** @type {string} */ label, /** @type {string | undefined} */ hint) => {
    const id = `${idPrefix}-${name}-${value || 'none'}`;
    return h('div', { class: 'reader-choice' }, [
      h('input', { type: 'radio', name: `${idPrefix}-${name}`, id, value, checked }),
      h('label', { for: id }, [
        h('span', { class: 'reader-choice-label' }, [label]),
        hint ? h('span', { class: 'reader-choice-hint' }, [hint]) : null,
      ]),
    ]);
  };

  const groups = [];
  if (show.profiles?.length) {
    groups.push(h('fieldset', { class: 'reader-choices' }, [
      h('legend', {}, ['Who are you?']),
      radio('profile', '', !prefs.profile, 'No preference', 'Show everything'),
      ...show.profiles.map((/** @type {any} */ p) => radio('profile', p.id, prefs.profile === p.id, p.label, p.description)),
    ]));
  }
  groups.push(h('fieldset', { class: 'reader-choices' }, [
    h('legend', {}, ['How deep?']),
    ...DEPTHS.map((d) => radio('depth', String(d.value), prefs.depth === d.value, d.label, d.hint)),
  ]));
  const routes = (show.paths ?? []).filter((/** @type {any} */ p) => p.slides !== '*');
  if (routes.length) {
    groups.push(h('fieldset', { class: 'reader-choices' }, [
      h('legend', {}, ['Which route?']),
      radio('path', '', !prefs.path, 'Everything', 'All slides, in order'),
      ...routes.map((/** @type {any} */ p) => radio('path', p.id, prefs.path === p.id, p.label, p.description)),
    ]));
  }

  const form = /** @type {HTMLFormElement} */ (h('form', { class: 'reader-choices-form' }, groups));
  const value = (/** @type {string} */ name) => /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name="${idPrefix}-${name}"]:checked`))?.value ?? '';
  return {
    form,
    read: () => ({
      profile: value('profile') || null,
      depth: /** @type {1|2|3} */ (Number(value('depth')) || 2),
      path: value('path') || null,
    }),
  };
}

/**
 * First-visit welcome. Resolves with the chosen prefs, or null when skipped.
 * @param {any} show
 * @param {import('./personalize.js').ReaderPrefs} prefs
 * @returns {Promise<import('./personalize.js').ReaderPrefs | null>}
 */
export function openWelcome(show, prefs) {
  const { form, read } = choicesForm(show, prefs, 'welcome');
  const start = h('button', { type: 'submit', class: 'reader-button reader-button--primary', value: 'start' }, ['Start reading']);
  const skip = h('button', { type: 'button', class: 'reader-button', value: 'skip' }, ['Skip']);
  form.append(h('div', { class: 'reader-dialog-actions' }, [skip, start]));

  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'reader-dialog reader-welcome', 'aria-labelledby': 'welcome-title' }, [
    h('h2', { id: 'welcome-title' }, [`Welcome to “${show.meta.title}”`]),
    show.meta.description ? h('p', { class: 'reader-welcome-intro' }, [show.meta.description]) : null,
    h('p', { class: 'reader-welcome-hint' }, ['Tell us a little about how you want to read. You can change this at any time with “Tailor” in the top bar.']),
    form,
  ]));
  document.body.append(dialog);

  return new Promise((resolve) => {
    let result = /** @type {import('./personalize.js').ReaderPrefs | null} */ (null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      result = read();
      dialog.close();
    });
    skip.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
  });
}

/**
 * The "Tailor" panel: a popover under the top bar. Changes apply immediately.
 * @param {any} show
 * @param {{ prefs: () => import('./personalize.js').ReaderPrefs, showNotes: () => boolean,
 *           onPrefs: (p: import('./personalize.js').ReaderPrefs) => void, onShowNotes: (v: boolean) => void }} io
 */
export function createTailorPanel(show, io) {
  const panel = h('div', { class: 'reader-panel reader-tailor', id: 'reader-tailor', popover: 'auto', 'aria-labelledby': 'tailor-title' });
  const button = h('button', { type: 'button', class: 'reader-tool', popovertarget: 'reader-tailor', title: 'Tailor this show' }, [
    h('span', { 'aria-hidden': 'true' }, ['⚙']), h('span', { class: 'reader-tool-label' }, ['Tailor']),
  ]);

  const render = () => {
    const { form, read } = choicesForm(show, io.prefs(), 'tailor');
    form.addEventListener('change', () => io.onPrefs(read()));
    const notes = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id: 'tailor-notes', checked: io.showNotes() }));
    notes.addEventListener('change', () => io.onShowNotes(notes.checked));
    const reset = h('button', { type: 'button', class: 'reader-button' }, ['Reset to standard']);
    reset.addEventListener('click', () => {
      io.onPrefs({ profile: null, depth: 2, path: null });
      render();
    });
    panel.replaceChildren(
      h('h2', { id: 'tailor-title' }, ['Tailor this show']),
      form,
      h('div', { class: 'reader-choice reader-choice--check' }, [notes, h('label', { for: 'tailor-notes' }, [h('span', { class: 'reader-choice-label' }, ['Show what the presenter said'])])]),
      h('div', { class: 'reader-dialog-actions' }, [reset]),
    );
  };
  panel.addEventListener('beforetoggle', (e) => {
    if (/** @type {ToggleEvent} */ (e).newState === 'open') render();
  });
  return { button, panel, refresh: render };
}
