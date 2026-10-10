// @ts-check
/**
 * Editor application entrypoint: initializes store, loads show context,
 * loads stylesheets, mounts UI panels and registers keyboard shortcuts.
 */

import { loadShow, loadShowFromFolder } from '../../shared/load.js';
import { createFolderSource } from '../../shared/folder-source.js';
import { listFolders, recallFolder, rememberFolder } from '../../shared/folder-handles.js';
import { createStore } from './store.js';
import { addStylesheet, h } from './dom.js';
import { canOpenFolders, ensurePermission, hasPermission } from './io/fs-access.js';
import { goToFolder, guardUnsavedChanges, newShow, openFolder, save } from './files.js';
import { mountToolbar } from './ui/toolbar.js';
import { mountSlideList } from './ui/slide-list.js';
import { mountSlideForm } from './ui/slide-form.js';
import { mountReaderForm } from './ui/reader-form.js';
import { mountShowSettings } from './ui/show-settings.js';
import { mountPreview } from './ui/preview.js';
import { renderAccessScreen, renderStartScreen, showBanner } from './ui/dialogs.js';
import { registerShortcuts } from './shortcuts.js';

/**
 * Entry: `?folder=<key>` opens a remembered show folder (E-002, D-012),
 * `?show=<url>` a show by URL, and no parameter shows the start screen.
 */
export async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const folderKey = params.get('folder');
  const showUrl = params.get('show');

  try {
    if (folderKey) {
      await openRememberedFolder(folderKey);
    } else if (showUrl) {
      await startEditor(await loadShow(showUrl), { showUrl });
    } else {
      await showStartScreen();
    }
  } catch (err) {
    console.error('Slipr editor:', err);
    await showStartScreen(err instanceof Error ? err.message : String(err));
  }
}

/**
 * @param {string} key
 */
async function openRememberedFolder(key) {
  const record = await recallFolder(key);
  if (!record) {
    await showStartScreen('That show folder is no longer known to this browser. Open it again.');
    return;
  }
  const load = async () => {
    const ctx = await loadShowFromFolder(createFolderSource(record.handle));
    await rememberFolder(record.handle, { title: ctx.show?.meta?.title });
    await startEditor(ctx, { folderHandle: record.handle });
  };
  if (await hasPermission(record.handle)) {
    await load();
    return;
  }
  // Permission must be asked from a click, never on page load.
  const screen = showScreen();
  const render = (/** @type {string | undefined} */ message) => renderAccessScreen(screen, {
    name: record.title ?? record.name,
    message,
    onGrant: async () => {
      if (!(await ensurePermission(record.handle))) {
        render('Access was not granted.');
        return;
      }
      try {
        await load();
      } catch (err) {
        console.error('Slipr editor:', err);
        render(err instanceof Error ? err.message : String(err));
      }
    },
    onCancel: () => {
      location.href = '?';
    },
  });
  render();
}

/** Show the screen container instead of the editor panels. */
function showScreen() {
  let screen = document.getElementById('slipr-editor-screen');
  if (!screen) {
    screen = h('div', { id: 'slipr-editor-screen', class: 'slipr-screen' });
    document.body.append(screen);
  }
  document.body.classList.add('is-screen');
  screen.hidden = false;
  return screen;
}

function hideScreen() {
  document.body.classList.remove('is-screen');
  const screen = document.getElementById('slipr-editor-screen');
  if (screen) screen.hidden = true;
}

/**
 * @param {string} [message]  An error to show.
 */
async function showStartScreen(message) {
  const screen = showScreen();
  const folders = canOpenFolders() ? await listFolders().catch(() => []) : [];
  /** @param {() => Promise<void>} action */
  const run = (action) => action().catch((err) => showStartScreen(err instanceof Error ? err.message : String(err)));
  renderStartScreen(screen, {
    message,
    canOpenFolders: canOpenFolders(),
    recent: folders.slice(0, 8),
    onOpen: () => run(() => openFolder()),
    onNew: () => run(() => newShow()),
    onRecent: (key) => run(async () => {
      const record = await recallFolder(key);
      if (record && (await ensurePermission(record.handle))) goToFolder(key);
    }),
  });
}

/**
 * Mount the editor for a loaded show.
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {{ showUrl?: string, folderHandle?: FileSystemDirectoryHandle }} source
 */
async function startEditor(ctx, { showUrl, folderHandle }) {
  hideScreen();

  // 1. Template stylesheets (theme.css and reader.css)
  await addStylesheet(ctx.resolveTemplateAsset(ctx.template.theme ?? 'theme.css'));
  if (ctx.template.reader) {
    await addStylesheet(ctx.resolveTemplateAsset(ctx.template.reader));
  }

  // 2. Store
  const store = createStore(ctx.show, { ...ctx, folderHandle: folderHandle ?? null });
  guardUnsavedChanges(store);
  for (const notice of ctx.notices) showBanner(notice, 'info');

  /** @param {() => Promise<void>} action */
  const run = (action) => action().catch((err) => showBanner(err instanceof Error ? err.message : String(err), 'error'));
  /** @param {'audience' | 'reader'} mode */
  const openViewer = (mode) => {
    if (!showUrl) {
      showBanner('Present and Read for a show opened from a folder come with E-007.', 'info', { timeout: 4000 });
      return;
    }
    const slideId = store.state.selectedSlideId ?? '';
    const hash = mode === 'reader' ? `&mode=reader#${slideId}` : `#/${slideId}`;
    window.open(`../viewer/?show=${encodeURIComponent(showUrl)}${hash}`, '_blank');
  };

  // 3. Toolbar
  const toolbarEl = document.getElementById('slipr-editor-toolbar');
  if (toolbarEl) {
    mountToolbar(toolbarEl, store, {
      onOpen: () => run(() => openFolder(store)),
      onNew: () => run(() => newShow(store)),
      onSave: () => run(() => save(store)),
      onPresent: () => openViewer('audience'),
      onRead: () => openViewer('reader'),
    });
  }

  // 4. Left sidebar (slide list)
  const sidebarEl = document.getElementById('slipr-editor-sidebar');
  if (sidebarEl) {
    mountSlideList(sidebarEl, store);
  }

  // 5. Center inspector (tabs: Slide, Reader, Settings)
  const inspectorEl = document.getElementById('slipr-editor-inspector');
  if (inspectorEl) {
    mountInspector(inspectorEl, store);
  }

  // 6. Right viewport (live preview)
  const previewEl = document.getElementById('slipr-editor-preview');
  if (previewEl) {
    mountPreview(previewEl, store);
  }

  // 7. Global shortcuts
  registerShortcuts(store, {
    onSave: () => run(() => save(store)),
    onPresent: () => openViewer('audience'),
  });
}

/**
 * Mount the center inspector tabs and containers.
 * @param {HTMLElement} container
 * @param {import('./store.js').EditorStore} store
 */
function mountInspector(container, store) {
  const header = h('div', { class: 'slipr-inspector-tabs' });
  const content = h('div', { class: 'slipr-inspector-content' });
  container.append(header, content);

  const slideContainer = h('div', { class: 'slipr-tab-pane' });
  const readerContainer = h('div', { class: 'slipr-tab-pane' });
  const settingsContainer = h('div', { class: 'slipr-tab-pane' });

  mountSlideForm(slideContainer, store);
  mountReaderForm(readerContainer, store);
  mountShowSettings(settingsContainer, store);

  function renderTabs() {
    header.innerHTML = '';
    const active = store.state.activeTab;

    const tabs = [
      { id: 'slide', label: 'Slide' },
      { id: 'reader', label: 'Reader' },
      { id: 'settings', label: 'Show Settings' },
    ];

    tabs.forEach((tab) => {
      const btn = h(
        'button',
        {
          class: `slipr-tab-btn ${active === tab.id ? 'is-active' : ''}`,
          onclick: () => store.setActiveTab(/** @type {'slide'|'reader'|'settings'} */ (tab.id)),
        },
        [tab.label]
      );
      header.append(btn);
    });

    slideContainer.style.display = active === 'slide' ? 'block' : 'none';
    readerContainer.style.display = active === 'reader' ? 'block' : 'none';
    settingsContainer.style.display = active === 'settings' ? 'block' : 'none';
  }

  content.append(slideContainer, readerContainer, settingsContainer);

  store.subscribe(({ changedKeys }) => {
    if (changedKeys.includes('activeTab')) {
      renderTabs();
    }
  });

  renderTabs();
}

bootstrap();
