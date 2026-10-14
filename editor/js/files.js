// @ts-check
/**
 * Open, New and Save for the editor (E-002). A show opened from a folder is
 * reopened by URL as `?folder=<key>` (D-012), so opening or creating a show
 * reloads the page with the new key.
 */
import { recallFolder, rememberFolder } from '../../shared/folder-handles.js';
import { canOpenFolders, createShowInFolder, ensurePermission, pickFolder, readShowJson, saveShow, writeImage } from './io/fs-access.js';
import { buildNewShow } from './io/new-show.js';
import { openChooseDialog, openDialog, openNewShowDialog, showBanner } from './ui/dialogs.js';
import { h, addStylesheet } from './dom.js';
import { readZip, createZipSource } from '../../shared/zip.js';
import { loadShowFromZip } from '../../shared/load.js';
import { exportZip } from './export-zip.js';
import { getDraftKey } from './io/draft-store.js';

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
  if (!store?.state.dirty) return true;
  if (confirm('You have unsaved changes. Discard them?')) {
    if (store?.draftStore && store?.draftKey) {
      store.draftStore.deleteDraft(store.draftKey);
    }
    return true;
  }
  return false;
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
 * Open a recently used show folder from the File menu (I-102): after the
 * unsaved-changes question, ask for access (this runs from a click) and go there.
 * @param {import('./store.js').EditorStore} store
 * @param {string} key
 */
export async function openRecentFolder(store, key) {
  if (!okToLeave(store)) return;
  const record = await recallFolder(key);
  if (!record) throw new Error('That show folder is no longer known to this browser. Open it with Open folder….');
  if (!(await ensurePermission(record.handle))) throw new Error(`Access to the folder "${record.name}" was not granted.`);
  goToFolder(key);
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
    if (store.state.zipSource) {
      return askSaveZipOrFolder(store);
    }
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
export function askForShowFolder(store) {
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

export { pickZipFile } from '../../shared/zip.js';


/**
 * Prompt user when multiple presentations are found in the archive.
 * @param {string} archiveName
 * @param {string[]} candidateShows
 * @returns {Promise<string | null>}
 */
export function chooseShowFromArchive(archiveName, candidateShows) {
  return new Promise((resolve) => {
    openDialog('Choose presentation in archive', (close) => {
      const list = h('ul', { style: 'list-style: none; padding: 0; margin: 12px 0;' }, candidateShows.map((path) => {
        const display = path ? path.replace(/\/$/, '') : '(root)';
        return h('li', { style: 'margin-bottom: 8px;' }, [
          h('button', {
            type: 'button',
            class: 'slipr-btn',
            style: 'width: 100%; text-align: left; padding: 8px 12px;',
            onclick: () => {
              close();
              resolve(path);
            },
          }, [display]),
        ]);
      }));

      const form = h('div', { class: 'slipr-dialog-form' }, [
        h('p', {}, [`The zip archive "${archiveName}" contains multiple presentations. Choose which one to open in the editor:`]),
        list,
        h('div', { class: 'slipr-dialog-actions' }, [
          h('button', {
            type: 'button',
            class: 'slipr-btn',
            onclick: () => {
              close();
              resolve(null);
            },
          }, ['Cancel']),
        ]),
      ]);

      return [form];
    });
  });
}

/**
 * Open a show from a user-uploaded zip file (.zip or .slipr) (I-092).
 *
 * @param {import('./store.js').EditorStore | undefined} store
 * @param {{ file?: File, onStartEditor?: (ctx: any, source: any) => Promise<void> }} [options]
 */
export async function openZipFile(store, options = {}) {
  if (!okToLeave(store)) return;
  const pickedFile = options.file ?? (await pickZipFile());
  if (!pickedFile) return;

  const buffer = await pickedFile.arrayBuffer();
  const entries = await readZip(buffer);

  const allShowFiles = Array.from(entries.keys()).filter((name) => name === 'show.json' || name.endsWith('/show.json'));
  if (allShowFiles.length === 0) {
    throw new Error(`The zip archive "${pickedFile.name}" does not contain a show.json file.`);
  }

  let chosenPath = '';
  const candidateShows = allShowFiles.map((f) => f === 'show.json' ? '' : f.slice(0, f.lastIndexOf('/') + 1));
  if (candidateShows.length === 1) {
    chosenPath = candidateShows[0];
  } else if (!entries.has('show.json')) {
    const picked = await chooseShowFromArchive(pickedFile.name, candidateShows);
    if (picked === null) return; // user cancelled
    chosenPath = picked;
  }

  const zipSource = createZipSource(entries, { name: pickedFile.name, path: chosenPath });
  const ctx = await loadShowFromZip(zipSource);

  if (store) {
    // Editor is running: switch store context and load stylesheets
    if (typeof document !== 'undefined') {
      await addStylesheet(ctx.resolveTemplateAsset(ctx.template.theme ?? 'theme.css'));
      if (ctx.template.reader) {
        await addStylesheet(ctx.resolveTemplateAsset(ctx.template.reader));
      }
    }
    store.loadContext(ctx);
    store.state.zipSource = zipSource;
    store.state.inMemoryAssets = new Map();
    const draftKey = getDraftKey({ showId: ctx.show?.id });
    // @ts-ignore
    store.draftKey = draftKey;
    // @ts-ignore
    if (store.autosave?.setMeta) {
      // @ts-ignore
      store.autosave.setMeta({ showId: ctx.show?.id, folderKey: null, showUrl: null });
    }
    if (typeof history !== 'undefined' && typeof location !== 'undefined') {
      history.replaceState(null, '', location.pathname);
    }
    if (typeof document !== 'undefined') {
      showBanner(`Opened "${ctx.show?.meta?.title || pickedFile.name}" from zip archive.`, 'success', { timeout: 3500 });
      for (const notice of ctx.notices) showBanner(notice, 'info');
    }
  } else if (options.onStartEditor) {
    await options.onStartEditor(ctx, { zipSource });
    if (typeof history !== 'undefined' && typeof location !== 'undefined') {
      history.replaceState(null, '', location.pathname);
    }
    if (typeof document !== 'undefined') {
      showBanner(`Opened "${ctx.show?.meta?.title || pickedFile.name}" from zip archive.`, 'success', { timeout: 3500 });
    }
  }
}

/**
 * Save a show opened from a zip archive to a local folder.
 * Extracts show.json and all assets to the chosen folder.
 * @param {import('./store.js').EditorStore} store
 * @returns {Promise<boolean>}
 */
export async function saveZipToFolder(store) {
  const handle = await pickFolder();
  if (!handle) return false;
  if (!(await ensurePermission(handle))) {
    showBanner(`No permission to write to the folder "${handle.name}".`, 'error');
    return false;
  }

  showBanner(`Extracting show into "${handle.name}"…`, 'info', { timeout: 3000 });

  // 1. Write show.json
  await saveShow(handle, store.state.show);

  // 2. Write original assets from zip source
  const zipSource = store.state.zipSource;
  if (zipSource && Array.isArray(zipSource.fileNames)) {
    const prefix = zipSource.prefix ?? '';
    for (const name of zipSource.fileNames) {
      if (name.startsWith(prefix)) {
        const rel = name.slice(prefix.length);
        if (rel && rel !== 'show.json' && !rel.endsWith('/')) {
          const bytes = zipSource.getBytes(rel);
          if (bytes) {
            await writeImage(handle, rel, new Blob([bytes]));
          }
        }
      }
    }
  }

  // 3. Write in-memory assets
  if (store.state.inMemoryAssets instanceof Map) {
    for (const [relPath, blob] of store.state.inMemoryAssets) {
      await writeImage(handle, relPath, blob);
    }
  }

  store.setFolderHandle(handle);
  store.markSaved(store.state.show);
  const key = await rememberFolder(handle, { title: store.state.show?.meta?.title });
  history.replaceState(null, '', `?folder=${encodeURIComponent(key)}`);
  showBanner(`Saved and extracted to the folder "${handle.name}".`, 'success', { timeout: 3000 });
  return true;
}

/**
 * When Ctrl+S or Save is clicked on a show opened from a zip archive.
 * @param {import('./store.js').EditorStore} store
 * @returns {Promise<boolean>}
 */
export async function askSaveZipOrFolder(store) {
  if (!canOpenFolders()) {
    // Browsers without File System Access (Firefox/Safari): directly export to zip
    const result = await exportZip(store);
    if (result) {
      store.markSaved(store.state.show);
      return true;
    }
    return false;
  }

  return new Promise((resolve) => {
    openDialog('Save show', (close) => [
      h('p', {}, ['This show was opened from a zip archive. You can save it as an updated zip archive, or extract and save it to a folder on your computer.']),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
        h('button', {
          type: 'button',
          class: 'slipr-btn',
          onclick: async () => {
            close();
            try {
              const saved = await saveZipToFolder(store);
              resolve(saved);
            } catch (err) {
              showBanner(`Not saved: ${err instanceof Error ? err.message : String(err)}`, 'error');
              resolve(false);
            }
          },
        }, ['Extract to folder…']),
        h('button', {
          type: 'button',
          class: 'slipr-btn slipr-btn-primary',
          onclick: async () => {
            close();
            try {
              const res = await exportZip(store);
              if (res) {
                store.markSaved(store.state.show);
                resolve(true);
              } else {
                resolve(false);
              }
            } catch (err) {
              showBanner(`Not saved: ${err instanceof Error ? err.message : String(err)}`, 'error');
              resolve(false);
            }
          },
        }, ['Save as zip…']),
      ]),
    ]);
  });
}

