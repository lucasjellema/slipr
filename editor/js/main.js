// @ts-check
/**
 * Editor application entrypoint: initializes store, loads show context,
 * loads stylesheets, mounts UI panels and registers keyboard shortcuts.
 */

import { loadShow } from '../../shared/load.js';
import { createStore } from './store.js';
import { addStylesheet, h } from './dom.js';
import { mountToolbar } from './ui/toolbar.js';
import { mountSlideList } from './ui/slide-list.js';
import { mountSlideForm } from './ui/slide-form.js';
import { mountReaderForm } from './ui/reader-form.js';
import { mountShowSettings } from './ui/show-settings.js';
import { mountPreview } from './ui/preview.js';
import { registerShortcuts } from './shortcuts.js';

export async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const showUrl = params.get('show') || '../shows/demo/show.json';

  try {
    // 1. Load the show and template via shared core
    const ctx = await loadShow(showUrl);

    // 2. Load template stylesheets (theme.css and reader.css)
    const themeHref = ctx.resolveTemplateAsset(ctx.template.styles?.theme ?? 'theme.css');
    await addStylesheet(themeHref);
    if (ctx.template.styles?.reader) {
      await addStylesheet(ctx.resolveTemplateAsset(ctx.template.styles.reader));
    }

    // 3. Initialize store
    const store = createStore(ctx.show, ctx);

    // 4. Mount Toolbar
    const toolbarEl = document.getElementById('slipr-editor-toolbar');
    if (toolbarEl) {
      mountToolbar(toolbarEl, store, {
        onSave: () => {
          store.markClean();
          alert('Saved! (Draft changes kept in store. Folder save via File System Access in E-002)');
        },
        onPresent: () => {
          const slideId = store.state.selectedSlideId ?? '';
          window.open(`../viewer/?show=${encodeURIComponent(showUrl)}#/${slideId}`, '_blank');
        },
        onRead: () => {
          const slideId = store.state.selectedSlideId ?? '';
          window.open(`../viewer/?show=${encodeURIComponent(showUrl)}&mode=reader#${slideId}`, '_blank');
        },
      });
    }

    // 5. Mount Left Sidebar (Slide list)
    const sidebarEl = document.getElementById('slipr-editor-sidebar');
    if (sidebarEl) {
      mountSlideList(sidebarEl, store);
    }

    // 6. Mount Center Inspector (Tabs: Slide, Reader, Settings)
    const inspectorEl = document.getElementById('slipr-editor-inspector');
    if (inspectorEl) {
      mountInspector(inspectorEl, store);
    }

    // 7. Mount Right Viewport (Live Preview)
    const previewEl = document.getElementById('slipr-editor-preview');
    if (previewEl) {
      mountPreview(previewEl, store);
    }

    // 8. Register global shortcuts
    registerShortcuts(store, {
      onSave: () => store.markClean(),
      onPresent: () => {
        const slideId = store.state.selectedSlideId ?? '';
        window.open(`../viewer/?show=${encodeURIComponent(showUrl)}#/${slideId}`, '_blank');
      },
    });
  } catch (err) {
    console.error('Failed to bootstrap Slipr Editor:', err);
    document.body.innerHTML = `
      <div style="padding: 2rem; color: #ff6b6b; font-family: system-ui;">
        <h1>Failed to load show</h1>
        <p>${err.message}</p>
        <p><a href="?show=../shows/demo/show.json" style="color: #4dabf7;">Open Demo Show</a></p>
      </div>
    `;
  }
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
