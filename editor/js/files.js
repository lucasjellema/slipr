// @ts-check
/**
 * Open, New and Save for the editor (E-002). A show opened from a folder is
 * reopened by URL as `?folder=<key>` (D-012), so opening or creating a show
 * reloads the page with the new key.
 */
import { rememberFolder } from '../../shared/folder-handles.js';
import { createShowInFolder, ensurePermission, pickFolder, readShowJson, saveShow } from './io/fs-access.js';
import { buildNewShow } from './io/new-show.js';
import { openChooseDialog, openNewShowDialog, showBanner } from './ui/dialogs.js';

/** Set while the page navigates on purpose, so the unsaved-changes warning stays quiet. */
let leaving = false;

/**
 * Warn before closing the tab with unsaved changes.
 * @param {import('./store.js').EditorStore} [store]
 */
export function guardUnsavedChanges(store) {
  window.addEventListener('beforeunload', (e) => {
    if (!leaving && store?.state.dirty) e.preventDefault();
  });
}

/**
 * Go to a remembered folder (reloads the editor).
 * @param {string} key
 */
export function goToFolder(key) {
  leaving = true;
  location.href = `?folder=${encodeURIComponent(key)}`;
}

/** @param {import('./store.js').EditorStore | undefined} store */
function okToLeave(store) {
  return !store?.state.dirty || confirm('You have unsaved changes. Discard them?');
}

/**
 * Open… : pick a folder that contains a show.json.
 * @param {import('./store.js').EditorStore} [store]
 */
export async function openFolder(store) {
  if (!okToLeave(store)) return;
  const handle = await pickFolder();
  if (!handle) return;
  const show = await readShowJson(handle);
  if (!show) {
    throw new Error(`The folder "${handle.name}" has no show.json. Pick the folder that contains a show, or use New… to create one.`);
  }
  goToFolder(await rememberFolder(handle, { title: show.meta?.title }));
}

/**
 * The templates listed in templates/index.json, with name and description.
 * @returns {Promise<{ id: string, name: string, description?: string, template: any }[]>}
 */
async function loadTemplateList() {
  const indexUrl = new URL('../templates/index.json', location.href);
  const response = await fetch(indexUrl);
  if (!response.ok) throw new Error(`Could not load the list of templates (${indexUrl.pathname}).`);
  const { templates } = await response.json();
  return Promise.all(templates.map(async (/** @type {string} */ id) => {
    const template = await (await fetch(new URL(`../templates/${id}/template.json`, location.href))).json();
    return { id, name: template.name ?? id, description: template.description, template };
  }));
}

/**
 * New… : choose title and template, then an empty folder.
 * @param {import('./store.js').EditorStore} [store]
 */
export async function newShow(store) {
  if (!okToLeave(store)) return;
  const templates = await loadTemplateList();
  openNewShowDialog({
    templates,
    async onCreate({ templateId, title }) {
      const entry = templates.find((t) => t.id === templateId);
      if (!entry) throw new Error(`Unknown template "${templateId}".`);
      if (!title.trim()) throw new Error('Give the show a title.');
      const handle = await pickFolder();
      if (!handle) return;
      const show = buildNewShow({ templateId, template: entry.template, title, date: new Date().toISOString().slice(0, 10) });
      await createShowInFolder(handle, show);
      goToFolder(await rememberFolder(handle, { title: show.meta.title }));
    },
  });
}

/**
 * Save (Ctrl+S). A show opened by URL first needs its folder on disk: that
 * opens a dialog, and this resolves false (not saved yet).
 * @param {import('./store.js').EditorStore} store
 * @returns {Promise<boolean>}  true when show.json on disk now matches the editor.
 */
export async function save(store) {
  const handle = store.state.folderHandle;
  if (!handle) {
    askForShowFolder(store);
    return false;
  }
  if (!(await ensurePermission(handle))) {
    showBanner(`Not saved: no permission to write to the folder "${handle.name}".`, 'error');
    return false;
  }
  const show = store.state.show;
  try {
    await saveShow(handle, show);
  } catch (err) {
    showBanner(`Not saved: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return false;
  }
  store.markSaved(show);
  showBanner(`Saved to the folder "${handle.name}".`, 'success', { timeout: 2500 });
  return true;
}

/**
 * Present / Read (E-007): save first, then open the viewer at the selected
 * slide. A folder show opens as viewer/?folder=<key> (D-012), a show opened by
 * URL as viewer/?show=<url>. The tab is opened right away (inside the click),
 * so the popup blocker allows it, and is pointed at the viewer after saving.
 * @param {import('./store.js').EditorStore} store
 * @param {'audience' | 'reader'} mode
 * @param {string | undefined} showUrl  The ?show= the editor was opened with.
 */
export async function openViewer(store, mode, showUrl) {
  const tab = window.open('', '_blank');
  try {
    if (store.state.dirty && !(await save(store))) {
      tab?.close();
      if (!store.state.folderHandle) showBanner('Save the show first: the viewer reads it from disk.', 'info', { timeout: 5000 });
      return;
    }
    const url = viewerUrl({
      folderKey: store.state.folderHandle ? new URLSearchParams(location.search).get('folder') : null,
      showUrl,
      mode,
      slideId: store.state.selectedSlideId,
    });
    if (!url) {
      tab?.close();
      showBanner('This show has no location the viewer can open.', 'error');
      return;
    }
    const href = new URL(url, location.href).href;
    if (tab) tab.location.href = href;
    else window.open(href, '_blank');
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * The viewer URL for a show, relative to the editor page.
 * @param {{ folderKey?: string | null, showUrl?: string | null, mode: 'audience' | 'reader', slideId?: string | null }} target
 * @returns {string | null}
 */
export function viewerUrl({ folderKey, showUrl, mode, slideId }) {
  let query;
  if (folderKey) query = `folder=${encodeURIComponent(folderKey)}`;
  else if (showUrl) query = `show=${encodeURIComponent(showUrl)}`;
  else return null;
  const id = slideId ?? '';
  const tail = mode === 'reader' ? `&mode=reader${id ? `#${id}` : ''}` : id ? `#/${id}` : '';
  return `../viewer/?${query}${tail}`;
}

/**
 * A show opened by URL (?show=…) has no folder handle yet. Ask for the folder
 * that holds this show, check it is the same show, then save there.
 * @param {import('./store.js').EditorStore} store
 */
function askForShowFolder(store) {
  const id = store.state.show?.id;
  openChooseDialog({
    title: 'Choose the show folder',
    text: `This show was opened by URL, so Slipr can't write to it yet. Choose the folder on disk that contains its show.json (show id "${id}").`,
    actionLabel: 'Choose folder…',
    async onChoose() {
      const handle = await pickFolder();
      if (!handle) return false;
      const onDisk = await readShowJson(handle);
      if (!onDisk) throw new Error(`The folder "${handle.name}" has no show.json.`);
      if (onDisk.id !== id) throw new Error(`The folder "${handle.name}" holds another show (id "${onDisk.id}").`);
      store.setFolderHandle(handle);
      const key = await rememberFolder(handle, { title: store.state.show?.meta?.title });
      history.replaceState(null, '', `?folder=${encodeURIComponent(key)}`);
      await save(store);
      return true;
    },
  });
}
