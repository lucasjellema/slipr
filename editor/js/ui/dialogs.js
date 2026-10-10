// @ts-check
/**
 * Editor screens and dialogs for files (E-002): start screen, access screen,
 * new-show dialog, choose-folder dialog, and notice banners.
 */
import { h } from '../dom.js';

/**
 * @typedef {object} RecentFolder
 * @property {string} key
 * @property {string} name
 * @property {string} [title]
 */

/**
 * Start screen: open a folder, create a show, reopen a recent folder.
 * @param {HTMLElement} container
 * @param {{ message?: string, recent: RecentFolder[], canOpenFolders: boolean,
 *   onOpen: () => void, onNew: () => void, onRecent: (key: string) => void }} options
 */
export function renderStartScreen(container, { message, recent, canOpenFolders, onOpen, onNew, onRecent }) {
  container.replaceChildren(
    h('div', { class: 'slipr-screen-card' }, [
      h('h1', { class: 'slipr-screen-title' }, ['Slipr Editor']),
      message ? h('p', { class: 'slipr-screen-error', role: 'alert' }, [message]) : null,
      canOpenFolders
        ? h('div', { class: 'slipr-screen-actions' }, [
            h('button', { class: 'slipr-btn slipr-btn-primary', onclick: onOpen }, ['Open show folder…']),
            h('button', { class: 'slipr-btn', onclick: onNew }, ['New show…']),
          ])
        : h('p', { class: 'slipr-help' }, ['Opening and saving show folders needs Chrome or Edge.']),
      recent.length && canOpenFolders
        ? h('div', { class: 'slipr-screen-recent' }, [
            h('h2', { class: 'slipr-label' }, ['Recent shows']),
            h('ul', {}, recent.map((r) =>
              h('li', {}, [
                h('button', { class: 'slipr-recent-item', onclick: () => onRecent(r.key) }, [
                  h('span', { class: 'slipr-recent-title' }, [r.title ?? r.name]),
                  h('span', { class: 'slipr-recent-folder' }, [r.name]),
                ]),
              ])
            )),
          ])
        : null,
      h('p', { class: 'slipr-help' }, [
        'Or open the ',
        h('a', { href: '?show=../shows/demo/show.json' }, ['demo show']),
        ' from the Slipr folder.',
      ]),
    ])
  );
}

/**
 * Ask for access to a remembered folder again (needs a click).
 * @param {HTMLElement} container
 * @param {{ name: string, message?: string, onGrant: () => void, onCancel: () => void }} options
 */
export function renderAccessScreen(container, { name, message, onGrant, onCancel }) {
  container.replaceChildren(
    h('div', { class: 'slipr-screen-card' }, [
      h('h1', { class: 'slipr-screen-title' }, ['Open “', name, '”']),
      h('p', {}, ['Your browser asks you to allow Slipr to read and save this folder again.']),
      message ? h('p', { class: 'slipr-screen-error', role: 'alert' }, [message]) : null,
      h('div', { class: 'slipr-screen-actions' }, [
        h('button', { class: 'slipr-btn slipr-btn-primary', onclick: onGrant }, ['Allow access']),
        h('button', { class: 'slipr-btn', onclick: onCancel }, ['Other show…']),
      ]),
    ])
  );
}

/**
 * Modal dialog shell. Resolves when it closes.
 * @param {string} title
 * @param {(close: () => void, setError: (msg: string) => void) => HTMLElement[]} body
 * @returns {HTMLDialogElement}
 */
function openDialog(title, body) {
  const error = h('p', { class: 'slipr-screen-error', role: 'alert', hidden: true });
  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'slipr-dialog', 'aria-label': title }));
  const close = () => dialog.close();
  const setError = (/** @type {string} */ msg) => {
    error.textContent = msg;
    error.hidden = !msg;
  };
  dialog.append(h('h2', { class: 'slipr-dialog-title' }, [title]), ...body(close, setError), error);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/**
 * New show: title and template, then pick an empty folder.
 * @param {{ templates: { id: string, name: string, description?: string }[],
 *   onCreate: (choice: { templateId: string, title: string }) => Promise<void> }} options
 */
export function openNewShowDialog({ templates, onCreate }) {
  openDialog('New show', (close, setError) => {
    const title = /** @type {HTMLInputElement} */ (h('input', { class: 'slipr-input', id: 'slipr-new-title', required: true, placeholder: 'My talk' }));
    const about = h('span', { class: 'slipr-help', id: 'slipr-new-template-about' });
    const describe = () => {
      about.textContent = templates.find((t) => t.id === select.value)?.description ?? '';
    };
    const select = /** @type {HTMLSelectElement} */ (h('select', {
      class: 'slipr-select',
      id: 'slipr-new-template',
      'aria-describedby': 'slipr-new-template-about',
      onchange: describe,
    }, templates.map((t) => h('option', { value: t.id }, [t.name]))));
    describe();
    const create = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary' }, ['Choose empty folder & create…']));
    const form = h('form', {
      class: 'slipr-dialog-form',
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        setError('');
        create.disabled = true;
        try {
          await onCreate({ templateId: select.value, title: title.value });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          create.disabled = false;
        }
      },
    }, [
      h('div', { class: 'slipr-form-group' }, [h('label', { class: 'slipr-label', for: 'slipr-new-title' }, ['Title']), title]),
      h('div', { class: 'slipr-form-group' }, [h('label', { class: 'slipr-label', for: 'slipr-new-template' }, ['Template']), select, about]),
      h('p', { class: 'slipr-help' }, ['The show is created in a folder you pick next: show.json and an images folder. The folder must not contain a show yet.']),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
        create,
      ]),
    ]);
    queueMicrotask(() => title.focus());
    return [form];
  });
}

/**
 * Explain a choice and run `onChoose` from the button click (so it may open a picker).
 * @param {{ title: string, text: string, actionLabel: string, onChoose: () => Promise<boolean> }} options
 *   `onChoose` resolves true to close the dialog.
 */
export function openChooseDialog({ title, text, actionLabel, onChoose }) {
  openDialog(title, (close, setError) => [
    h('p', {}, [text]),
    h('div', { class: 'slipr-dialog-actions' }, [
      h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
      h('button', {
        type: 'button',
        class: 'slipr-btn slipr-btn-primary',
        onclick: async () => {
          setError('');
          try {
            if (await onChoose()) close();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        },
      }, [actionLabel]),
    ]),
  ]);
}

/**
 * Alt text for an image just added (E-006). Saving with an empty field is
 * allowed (the validator keeps warning), so the user is never stuck.
 * @param {{ path: string, previewUrl: string, alt: string,
 *   onSave: (alt: string) => void, onClose?: () => void }} options
 */
export function openAltTextDialog({ path, previewUrl, alt, onSave, onClose }) {
  const dialog = openDialog('Describe the image', (close) => {
    const input = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'slipr-textarea slipr-textarea-sm',
      id: 'slipr-alt-text',
      placeholder: 'What the image shows, for people who cannot see it',
    }, [alt]));
    const form = h('form', {
      class: 'slipr-dialog-form',
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        onSave(input.value.trim());
        close();
      },
    }, [
      h('img', { class: 'slipr-alt-preview', src: previewUrl, alt: '' }),
      h('p', { class: 'slipr-help' }, [`Saved as ${path}`]),
      h('div', { class: 'slipr-form-group' }, [h('label', { class: 'slipr-label', for: 'slipr-alt-text' }, ['Alt text']), input]),
      h('p', { class: 'slipr-help' }, ['Screen readers read this aloud, and reader mode shows it when the image cannot load. Leave it empty only for decoration.']),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Later']),
        h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary' }, ['Save alt text']),
      ]),
    ]);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    queueMicrotask(() => input.focus());
    return [form];
  });
  if (onClose) dialog.addEventListener('close', onClose);
}

/**
 * A dismissible notice under the toolbar.
 * @param {string} message
 * @param {'info' | 'error' | 'success'} [kind]
 * @param {{ timeout?: number }} [options]  Auto-hide after ms (success notices).
 */
export function showBanner(message, kind = 'info', { timeout } = {}) {
  let host = document.getElementById('slipr-editor-banners');
  if (!host) {
    host = h('div', { id: 'slipr-editor-banners', class: 'slipr-banners', 'aria-live': 'polite' });
    document.getElementById('slipr-editor-toolbar')?.after(host);
  }
  const banner = h('div', { class: `slipr-banner slipr-banner--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, [
    h('span', {}, [message]),
    h('button', { class: 'slipr-btn slipr-btn-sm', 'aria-label': 'Dismiss', onclick: () => banner.remove() }, ['×']),
  ]);
  host.append(banner);
  if (timeout) setTimeout(() => banner.remove(), timeout);
}
