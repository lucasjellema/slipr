// @ts-check
/**
 * Viewer entry: read URL parameters, load + validate the show, start a mode.
 *   ?show=<path to show.json>  or  ?folder=<key>  (a show folder remembered in this browser, D-012)
 *   &mode=audience|reader      (default audience)
 */
import { loadShow, loadShowFromFolder, loadShowFromZip, LoadError } from '../../shared/load.js';
import { createFolderSource } from '../../shared/folder-source.js';
import { downloadZip, readZip, createZipSource } from '../../shared/zip.js';
import { recallFolder, rememberFolder } from '../../shared/folder-handles.js';
import { addStylesheet } from './dom.js';
import { showAccessPage, showHelp, showLoadError, showProgress, showValidationErrors } from './error-view.js';

const app = /** @type {HTMLElement} */ (document.getElementById('app'));
const params = new URLSearchParams(location.search);
const showParam = params.get('show');
const folderParam = params.get('folder');
const zipParam = params.get('zip');
const pathParam = params.get('path');
const mode = params.get('mode') === 'reader' ? 'reader' : 'audience';

main().catch((err) => {
  console.error(err);
  showLoadError(app, { title: 'Something went wrong', message: err instanceof Error ? err.message : String(err) });
});

async function main() {
  // A single-file export (I-054): the show, its template and the viewer are all in this file.
  const bundle = /** @type {any} */ (globalThis).SLIPR_BUNDLE;
  if (bundle) {
    await present(async () => {
      const ctx = await loadShow(bundle.showUrl, { fetch: bundle.fetch, checkImages: false });
      const { resolveAsset, resolveTemplateAsset } = ctx;
      return {
        ...ctx,
        resolveAsset: (src) => bundle.url(resolveAsset(src)),
        resolveTemplateAsset: (path) => bundle.url(resolveTemplateAsset(path)),
      };
    });
    return;
  }
  if (zipParam) {
    await openZipShow(zipParam, pathParam);
    return;
  }
  if (folderParam) {
    await openFolderShow(folderParam);
    return;
  }
  if (!showParam) {
    showHelp(app, { onOpenFolder: 'showDirectoryPicker' in window ? pickFolder : undefined });
    return;
  }
  await present(() => loadShow(showParam));
}

/**
 * Load and present a show from a zip file URL (I-087).
 * @param {string} zipUrl
 * @param {string | null} [showPath]
 */
async function openZipShow(zipUrl, showPath) {
  showProgress(app, { title: 'Downloading presentation…', percent: null });

  let bytes;
  try {
    bytes = await downloadZip(zipUrl, {
      onProgress: ({ loaded, total, percent }) => {
        const detail = total
          ? `${formatBytes(loaded)} / ${formatBytes(total)} (${percent}%)`
          : `${formatBytes(loaded)} downloaded`;
        showProgress(app, {
          title: 'Downloading presentation…',
          percent,
          detail,
        });
      },
    });
  } catch (err) {
    if (err instanceof LoadError) {
      showLoadError(app, { title: 'The presentation zip could not be downloaded', message: err.message, url: err.url });
      return;
    }
    throw err;
  }

  showProgress(app, { title: 'Extracting presentation…', percent: null });

  let entries;
  try {
    entries = await readZip(bytes);
  } catch (err) {
    if (err instanceof LoadError) {
      showLoadError(app, { title: 'The zip file could not be read', message: err.message });
      return;
    }
    throw err;
  }

  let source;
  try {
    source = createZipSource(entries, { name: zipUrl, path: showPath ?? undefined });
  } catch (err) {
    if (err instanceof LoadError) {
      showLoadError(app, { title: 'Could not open show from zip', message: err.message });
      return;
    }
    throw err;
  }

  await present(() => loadShowFromZip(source));
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A show folder remembered in this browser by the editor or by "Open a show
 * folder…" (D-012). Reading it may need permission again, asked from a click.
 * @param {string} key
 */
async function openFolderShow(key) {
  const record = await recallFolder(key);
  if (!record) {
    showLoadError(app, {
      title: 'This show folder is not known here',
      message: 'Folder links only work in the browser where the folder was opened, in the Slipr editor or with “Open a show folder…” on the viewer start page. Open the folder there again.',
    });
    return;
  }
  const handle = /** @type {any} */ (record.handle);
  const load = () => loadShowFromFolder(createFolderSource(handle));
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') {
    await present(load);
    return;
  }
  showAccessPage(app, {
    name: record.title ?? record.name,
    onGrant: async () => {
      if ((await handle.requestPermission({ mode: 'read' })) === 'granted') await present(load);
    },
  });
}

/** "Open a show folder…" on the help page: pick, remember, reopen as ?folder=. */
async function pickFolder() {
  let handle;
  try {
    handle = await /** @type {any} */ (window).showDirectoryPicker({ id: 'slipr-show', mode: 'read' });
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') return;
    throw err;
  }
  const text = await createFolderSource(handle).readText('show.json');
  if (text === null) {
    showLoadError(app, { title: 'No show in this folder', message: `The folder "${handle.name}" has no show.json. Pick the folder that contains the show.` });
    return;
  }
  let title;
  try {
    title = JSON.parse(text)?.meta?.title;
  } catch {
    // An invalid show.json gets the full error page once the viewer loads it.
  }
  const url = new URL(location.href);
  url.search = `?folder=${encodeURIComponent(await rememberFolder(handle, { title }))}`;
  location.href = url.href;
}

/**
 * Load, validate and start the requested mode.
 * @param {() => Promise<import('../../shared/load.js').ShowContext>} load
 */
async function present(load) {
  let ctx;
  try {
    ctx = await load();
  } catch (err) {
    if (err instanceof LoadError) {
      const unreachable = err.kind === 'fetch' && err.status === undefined;
      showLoadError(app, { title: 'This show could not be loaded', message: err.message, url: err.url, serverHint: unreachable });
      return;
    }
    throw err;
  }

  const { validation, show } = ctx;
  for (const notice of ctx.notices) console.info(`Slipr: ${notice}`);
  if (validation.warnings.length) {
    console.groupCollapsed(`Slipr: ${validation.warnings.length} warning(s) in ${ctx.showUrl.pathname}`);
    for (const w of validation.warnings) console.warn(`${w.path}: ${w.message}`);
    console.groupEnd();
  }
  if (!validation.ok) {
    showValidationErrors(app, { showUrl: ctx.showUrl, errors: validation.errors, warnings: validation.warnings, title: show?.meta?.title });
    return;
  }

  document.title = `${show.meta.title} · Slipr`;
  document.documentElement.lang = show.meta.language ?? 'en';
  await addStylesheet(ctx.resolveTemplateAsset(ctx.template.theme));

  if (mode === 'audience') {
    const { startAudience } = await import('../audience/audience.js');
    await startAudience(app, ctx);
  } else {
    const { startReader } = await import('../reader/reader.js');
    await startReader(app, ctx);
  }
}
