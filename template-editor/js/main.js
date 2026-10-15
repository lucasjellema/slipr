// @ts-check
/**
 * Slipr Template Editor (I-106): start screen, workspace, saving.
 *
 * State flows one way, as in the show editor: UI → `store.update(action)` →
 * subscribers (title bar, token panel, preview). Every change is a pure
 * function in `actions.js`.
 */
import { createStore } from './store.js';
import {
  openTemplate, catalogOf, sheetTexts, setToken, setMeta, setStyleguideFont, addFont,
  outputFiles, changedPaths, deletedPaths, markSaved, asClone,
} from './actions.js';
import {
  layoutDef, composedOf, looksOf, textFile, addLayout, removeLayout, addSlotBox, addPictureBox, addImageFile,
  layoutIdProblem, setBox,
} from './layout-actions.js';
import { rootClasses, looksFor, freeName, typeLabel, templateImages, isSlotName, SLOT_TYPES } from './composer/layout-model.js';
import { TABS } from './token-catalog.js';
import { checkContrast } from './contrast-pairs.js';
import { fontFaceFamilies, cleanFamily } from './css-tokens.js';
import { cloneTemplateJson, cloneReadme, idFromName, isTemplateId, syncStyleguide, familyFromFileName, supportsFourThree } from './template-files.js';
import { SAMPLE_SHOWS, generatedSample, fitSample, bestSample, withAspect } from './sample-show.js';
import {
  listBuiltInTemplates, readTemplateFromUrl, readTemplateFromFolder, writeTemplateFiles, removeTemplateFiles,
  pickFolder, canUseFolders, ensureWritable, templateZip, download,
} from './source.js';
import { renderTokenPanel, flashRow } from './ui/token-panel.js';
import { renderTemplateTab } from './ui/template-tab.js';
import { renderLayoutsTab } from './ui/layouts-tab.js';
import { createStageOverlay } from './ui/stage-overlay.js';
import { createPreview } from './ui/preview-frame.js';
import { validateTemplate } from '../../shared/validate.js';

/** @typedef {import('./actions.js').TemplateState} TemplateState */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const el = {
  title: $('te-title'),
  actions: $('te-actions'),
  undo: /** @type {HTMLButtonElement} */ ($('te-undo')),
  redo: /** @type {HTMLButtonElement} */ ($('te-redo')),
  save: /** @type {HTMLButtonElement} */ ($('te-save')),
  saveAs: /** @type {HTMLButtonElement} */ ($('te-save-as')),
  zip: /** @type {HTMLButtonElement} */ ($('te-zip')),
  close: /** @type {HTMLButtonElement} */ ($('te-close')),
  banner: $('te-banner'),
  start: $('te-start'),
  startList: $('te-start-list'),
  openFolder: /** @type {HTMLButtonElement} */ ($('te-open-folder')),
  openHint: $('te-open-hint'),
  workspace: $('te-workspace'),
  tabs: $('te-tabs'),
  filterRow: $('te-filter-row'),
  filter: /** @type {HTMLInputElement} */ ($('te-filter')),
  body: $('te-panel-body'),
  sample: /** @type {HTMLSelectElement} */ ($('te-sample')),
  frame: /** @type {HTMLIFrameElement} */ ($('te-preview-frame')),
  cloneDialog: /** @type {HTMLDialogElement} */ ($('te-clone-dialog')),
  cloneForm: /** @type {HTMLFormElement} */ ($('te-clone-form')),
  fontDialog: /** @type {HTMLDialogElement} */ ($('te-font-dialog')),
  fontForm: /** @type {HTMLFormElement} */ ($('te-font-form')),
  layoutDialog: /** @type {HTMLDialogElement} */ ($('te-layout-dialog')),
  layoutForm: /** @type {HTMLFormElement} */ ($('te-layout-form')),
  slotDialog: /** @type {HTMLDialogElement} */ ($('te-slot-dialog')),
  slotForm: /** @type {HTMLFormElement} */ ($('te-slot-form')),
  pictureDialog: /** @type {HTMLDialogElement} */ ($('te-picture-dialog')),
  pictureForm: /** @type {HTMLFormElement} */ ($('te-picture-form')),
};

const preview = createPreview(el.frame);
const overlay = createStageOverlay($('te-stage-overlay'), {
  getRect: () => preview.canvasRect(),
  onSelect: (id) => selectBox(id, false),
  onChange: (boxId, area, gesture) => {
    if (view.layout) update((s) => setBox(s, /** @type {string} */ (view.layout), boxId, { area }), `${gesture}:${view.layout}`);
  },
});
// The frame lays out its slide after the observer fires: follow the frame's own resize too.
new ResizeObserver(() => requestAnimationFrame(() => overlay.reposition())).observe(el.frame);
const followFrame = () => el.frame.contentWindow?.addEventListener('resize', () => overlay.reposition());
if (el.frame.contentDocument?.readyState === 'complete') followFrame();
el.frame.addEventListener('load', followFrame);

/** @type {ReturnType<typeof createStore<TemplateState>> | null} */
let store = null;
/** Where Save writes: the opened folder, or the folder of the last Save as. */
/** @type {FileSystemDirectoryHandle | null} */
let folder = null;
/** @type {Array<{ id: string, name: string, description: string }>} */
let builtIn = [];
/** Sample shows by id, loaded once. */
/** @type {Map<string, any>} */
const samples = new Map();

const view = {
  /** @type {string} */ tab: 'color',
  /** @type {'audience' | 'reader'} */ mode: 'audience',
  /** @type {'16:9' | '4:3'} */ aspect: '16:9',
  /** @type {string} */ sample: 'generated',
  /** Panel rebuilds wait while a colour picker is dragged. */
  swatchActive: false,
  /** The layout selected on the Layouts tab (I-111): the preview stages it. */
  /** @type {string | null} */ layout: null,
  /** The selected box of a composed layout. */
  /** @type {string | null} */ box: null,
};

// ---------------------------------------------------------------------------
// Start screen

async function showStart() {
  el.start.hidden = false;
  el.workspace.hidden = true;
  el.actions.hidden = true;
  el.title.textContent = '';
  document.title = 'Slipr Template Editor';
  el.openFolder.disabled = !canUseFolders();
  if (!canUseFolders()) el.openHint.textContent = 'Opening and saving folders needs Edge or Chrome. You can still start from a template and download it as a .zip.';
  if (!builtIn.length) builtIn = await listBuiltInTemplates().catch((err) => {
    banner(err instanceof Error ? err.message : String(err), 'error');
    return [];
  });
  el.startList.replaceChildren(...builtIn.map((t) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'te-start-card';
    const strong = document.createElement('strong');
    strong.textContent = `Start from ${t.name}`;
    const span = document.createElement('span');
    span.textContent = t.description;
    button.append(strong, span);
    button.addEventListener('click', () => run(() => startClone(t)));
    return button;
  }));
}

/**
 * Ask for a name and id, then read the template and open the clone.
 * @param {{ id: string, name: string }} source
 */
async function startClone(source) {
  const form = el.cloneForm;
  const nameInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('name'));
  const idInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('id'));
  const error = $('te-clone-error');
  $('te-clone-source').textContent = `A copy of "${source.name}" with its layouts, stylesheets and assets.`;
  nameInput.value = `${source.name} copy`;
  idInput.value = idFromName(nameInput.value);
  error.textContent = '';
  let idTouched = false;
  nameInput.oninput = () => { if (!idTouched) idInput.value = idFromName(nameInput.value); };
  idInput.oninput = () => { idTouched = true; };
  const answer = await dialogResult(el.cloneDialog, () => {
    const id = idInput.value.trim();
    if (!nameInput.value.trim()) return 'Give the template a name.';
    if (!isTemplateId(id)) return 'The id needs lower case letters, digits and single hyphens.';
    if (builtIn.some((t) => t.id === id)) return `Slipr already has a template "${id}". Pick another id.`;
    return null;
  }, error);
  if (!answer) return;
  banner(`Reading "${source.name}"…`, 'info');
  const files = await readTemplateFromUrl(new URL(`../templates/${encodeURIComponent(source.id)}/`, location.href));
  const state = openTemplate(files);
  const date = new Date().toISOString().slice(0, 10);
  const template = cloneTemplateJson(state.template, { id: idInput.value.trim(), name: nameInput.value.trim(), date });
  folder = null;
  await openWorkspace(asClone(state, { template, readme: cloneReadme(template, state.template, date) }));
  banner(`"${template.name}" is a copy of "${source.name}". It is not saved yet: Save as folder… or Download .zip.`, 'info');
}

async function openFolder() {
  const handle = await pickFolder('slipr-template');
  if (!handle) return;
  const files = await readTemplateFromFolder(handle);
  folder = handle;
  await openWorkspace(openTemplate(files));
  banner(`Opened the folder "${handle.name}". Save writes the changed files back.`, 'info');
}

// ---------------------------------------------------------------------------
// Workspace

/** @param {TemplateState} state */
async function openWorkspace(state) {
  el.start.hidden = true;
  el.workspace.hidden = false;
  el.actions.hidden = false;
  preview.clear();
  view.layout = null;
  view.box = null;
  if (!store) {
    store = createStore(state);
    store.subscribe(onChange);
  } else {
    store.replace(state);
  }
  previous = state;
  await loadSamples();
  view.sample = bestSample(state.template, samples);
  setAspectChoice(state);
  fillSampleSelect(state);
  renderTabs();
  updateChrome();
  renderPanel();
  await renderPreview();
}

/**
 * After every change: the title bar, the preview's stylesheets and the panel.
 * (Opening a template draws everything itself, in openWorkspace.)
 * @param {TemplateState} state
 * @param {{ coalesceKey?: string, kind: string }} info
 */
function onChange(state, info) {
  updateChrome();
  const before = previous;
  previous = state;
  if (info.kind === 'replace') return;
  // Undo may take a selected layout or box away.
  if (view.layout && !layoutDef(state, view.layout)) view.layout = view.box = null;
  if (view.layout && view.box && !composedOf(state, view.layout)?.boxes.some((b) => b.id === view.box)) view.box = null;
  if (before && layoutsChanged(before, state)) {
    if (renderTabsNeeded(before, state)) renderTabs();
    run(renderPreview);
  } else {
    preview.setStyles(state);
    updateOverlay();
  }
  // While a colour picker is dragged the panel waits (a rebuild would close the picker).
  if (!view.swatchActive) renderPanel();
}

/** The state the subscribers saw last (to tell what a change touched). */
/** @type {TemplateState | null} */
let previous = null;

/**
 * Did the layouts change in a way that needs a new render (not just CSS)?
 * @param {TemplateState} a @param {TemplateState} b
 */
function layoutsChanged(a, b) {
  if (a.template.layouts !== b.template.layouts) return true;
  return (b.template.layouts ?? []).some((/** @type {any} */ l) => a.files.get(l.file) !== b.files.get(l.file));
}

/** @param {TemplateState} a @param {TemplateState} b */
function renderTabsNeeded(a, b) {
  return (a.template.layouts ?? []).length !== (b.template.layouts ?? []).length;
}

function updateChrome() {
  if (!store) return;
  const state = store.get();
  const changed = changedPaths(state).length > 0;
  el.title.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = state.template.name ?? state.template.id;
  el.title.append(strong, ` (${state.template.id} ${state.template.version})${folder ? ` · folder ${folder.name}` : ' · not saved'}${changed ? ' · changed' : ''}`);
  document.title = `${changed ? '• ' : ''}${state.template.name ?? 'Template'} · Slipr Template Editor`;
  el.undo.disabled = !store.canUndo();
  el.redo.disabled = !store.canRedo();
  el.save.disabled = !canUseFolders();
  el.saveAs.disabled = !canUseFolders();
}

function renderTabs() {
  if (!store) return;
  const catalog = catalogOf(store.get());
  const tabs = [
    ...TABS.map((t) => ({ id: t.id, label: t.label, count: /** @type {number | null} */ (catalog.filter((x) => x.kind === t.id).length) })),
    { id: 'layouts', label: 'Layouts', count: (store.get().template.layouts ?? []).length },
    { id: 'template', label: 'Template', count: null },
  ];
  el.tabs.replaceChildren(...tabs.map((t) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.id = `te-tab-${t.id}`;
    tab.dataset.tab = t.id;
    tab.setAttribute('aria-selected', String(t.id === view.tab));
    tab.tabIndex = t.id === view.tab ? 0 : -1;
    tab.append(t.label);
    if (t.count !== null) {
      const count = document.createElement('span');
      count.className = 'te-count';
      count.textContent = String(t.count);
      tab.append(count);
    }
    tab.addEventListener('click', () => selectTab(t.id));
    return tab;
  }));
}

/** @param {string} id */
function selectTab(id) {
  const staged = stageActive();
  view.tab = id;
  if (staged !== stageActive()) run(renderPreview);
  for (const tab of el.tabs.querySelectorAll('[role="tab"]')) {
    const selected = /** @type {HTMLElement} */ (tab).dataset.tab === id;
    tab.setAttribute('aria-selected', String(selected));
    /** @type {HTMLElement} */ (tab).tabIndex = selected ? 0 : -1;
  }
  el.body.scrollTop = 0;
  renderPanel();
}

el.tabs.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = /** @type {HTMLElement[]} */ ([...el.tabs.querySelectorAll('[role="tab"]')]);
  const i = tabs.findIndex((t) => t.dataset.tab === view.tab);
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  selectTab(next.dataset.tab ?? 'color');
  next.focus();
});

function renderPanel() {
  if (!store) return;
  const state = store.get();
  el.body.setAttribute('aria-labelledby', `te-tab-${view.tab}`);
  el.filterRow.hidden = view.tab === 'template' || view.tab === 'layouts';
  if (view.tab === 'layouts') {
    const readText = (/** @type {string} */ p) => textFile(state, p);
    renderLayoutsTab(el.body, {
      state,
      layout: view.layout,
      box: view.box,
      colors: catalogOf(state).filter((t) => t.kind === 'color').map((t) => ({ name: t.name, label: t.label })),
      variants: rootClasses(state.template, readText).variants,
      update,
      onSelectLayout: (id) => selectLayout(id),
      onSelectBox: (id) => selectBox(id, true),
      onNewLayout: (from) => run(() => newLayout(from)),
      onAddSlot: () => run(addSlot),
      onAddPicture: () => run(addPicture),
      onRemoveLayout: (id) => {
        const def = layoutDef(state, id);
        if (!def || !confirm(`Remove the layout "${def.name ?? id}"? Shows that use it can no longer show those slides. Its file ${def.file} is deleted when you save.`)) return;
        view.layout = view.box = null;
        update((s) => removeLayout(s, id));
      },
    });
    return;
  }
  if (view.tab === 'template') {
    renderTemplateTab(el.body, {
      template: syncStyleguide(state.template, state.links, catalogOf(state)),
      links: state.links,
      onMeta: (field, value) => update((s) => setMeta(s, field, value), `meta:${field}`),
      onFont: (key, value) => update((s) => setStyleguideFont(s, key, value), `font:${key}`),
      onShowToken: (name) => showToken(name),
    });
    return;
  }
  const catalog = catalogOf(state);
  renderTokenPanel(el.body, {
    catalog,
    kind: /** @type {any} */ (view.tab),
    filter: el.filter.value,
    contrast: checkContrast(catalog),
    families: fontFaceFamilies(sheetTexts(state).theme),
    onSet: (name, value, source) => {
      view.swatchActive = source === 'swatch';
      update((s) => setToken(s, name, value), source === 'click' ? undefined : `token:${name}`);
    },
    onRefresh: () => {
      view.swatchActive = false;
      renderPanel();
    },
    onAddFont: (token) => run(() => addFontFile(token)),
  });
}

/** @param {string} name */
function showToken(name) {
  if (!store) return;
  const token = catalogOf(store.get()).find((t) => t.name === name);
  if (!token) return;
  el.filter.value = '';
  selectTab(token.kind);
  flashRow(name);
}

el.filter.addEventListener('input', () => renderPanel());

/**
 * @param {(s: TemplateState) => TemplateState} change @param {string} [coalesceKey]
 */
function update(change, coalesceKey) {
  if (!store) return;
  try {
    store.update(change, { coalesceKey });
  } catch (err) {
    banner(err instanceof Error ? err.message : String(err), 'error');
  }
}

// ---------------------------------------------------------------------------
// Layouts (I-111)

/** Does the preview stage one layout (the Layouts tab with a layout selected)? */
function stageActive() {
  return view.tab === 'layouts' && Boolean(view.layout);
}

/** @param {string | null} id */
function selectLayout(id) {
  const staged = stageActive();
  view.layout = id;
  view.box = null;
  el.body.scrollTop = 0;
  renderPanel();
  if (staged || stageActive()) run(renderPreview);
}

/**
 * @param {string | null} id @param {boolean} focusBox  Selected in the panel: focus the box in the preview.
 */
function selectBox(id, focusBox) {
  if (view.box === id) return;
  view.box = id;
  renderPanel();
  updateOverlay();
  if (id && focusBox) overlay.focus(id);
}

/** The boxes over the staged slide: a composed layout in audience mode. */
function updateOverlay() {
  const model = store && stageActive() && view.mode === 'audience' ? composedOf(store.get(), /** @type {string} */ (view.layout)) : null;
  if (!model) {
    overlay.update(null, null);
    return;
  }
  const def = layoutDef(/** @type {any} */ (store).get(), model.id);
  overlay.update(model.boxes.map((b) => {
    const slot = (def?.slots ?? []).find((/** @type {any} */ s) => s.name === b.slot);
    return { id: b.id, label: b.slot ? `${b.slot} · ${typeLabel(slot?.type ?? '')}` : `${b.id} · picture`, area: b.area, picture: !b.slot };
  }), view.box);
}

/**
 * Ask for a name and id, and add a composed layout (empty, or a copy of `from`).
 * @param {string | null} from
 */
async function newLayout(from) {
  if (!store) return;
  const state = store.get();
  const form = el.layoutForm;
  form.reset();
  const nameInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('name'));
  const idInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('id'));
  const fromSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('from'));
  fromSelect.replaceChildren(new Option('An empty slide with a title', ''),
    ...(state.template.layouts ?? []).map((/** @type {any} */ l) => new Option(`A copy of "${l.name ?? l.id}"`, l.id)));
  fromSelect.value = from ?? '';
  const source = from ? layoutDef(state, from) : null;
  nameInput.value = source ? `${source.name ?? source.id} (composed)` : '';
  const suggest = () => {
    const base = idFromName(nameInput.value) || 'layout';
    const taken = (store?.get().template.layouts ?? []).map((/** @type {any} */ l) => l.id);
    idInput.value = freeName(base, [...taken, 'base']);
  };
  suggest();
  let idTouched = false;
  nameInput.oninput = () => { if (!idTouched) suggest(); };
  idInput.oninput = () => { idTouched = true; };
  const ok = await dialogResult(el.layoutDialog, () => {
    if (!nameInput.value.trim()) return 'Give the layout a name.';
    return layoutIdProblem(/** @type {any} */ (store).get(), idInput.value.trim());
  }, $('te-layout-error'));
  if (!ok) return;
  const id = idInput.value.trim();
  update((s) => addLayout(s, { id, name: nameInput.value.trim(), from: fromSelect.value || null }));
  if (layoutDef(store.get(), id)) {
    selectLayout(id);
    banner(`Added the layout "${nameInput.value.trim()}" (layouts/${id}.html and a block at the end of theme.css).`, 'success');
  }
}

async function addSlot() {
  if (!store || !view.layout) return;
  const layoutId = view.layout;
  const form = el.slotForm;
  form.reset();
  const typeSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('type'));
  const nameInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('name'));
  const lookSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('look'));
  typeSelect.replaceChildren(...SLOT_TYPES.map(([t, label]) => new Option(label, t)));
  const taken = () => (layoutDef(/** @type {any} */ (store).get(), layoutId)?.slots ?? []).map((/** @type {any} */ s) => s.name);
  /** @type {Record<string, string>} */
  const names = { text: 'subtitle', richtext: 'body', list: 'body', image: 'image', 'tag-cloud': 'cloud' };
  let nameTouched = false;
  const fillLooks = () => {
    if (!nameTouched) nameInput.value = freeName(names[typeSelect.value] ?? typeSelect.value, taken());
    const looks = looksFor(looksOf(/** @type {any} */ (store).get()), typeSelect.value, nameInput.value);
    lookSelect.replaceChildren(...looks.map((l) => new Option(l.label, l.key)));
  };
  typeSelect.value = 'richtext';
  fillLooks();
  typeSelect.onchange = fillLooks;
  nameInput.oninput = () => { nameTouched = true; };
  const ok = await dialogResult(el.slotDialog, () => {
    const name = nameInput.value.trim();
    if (!isSlotName(name)) return 'A slot name has letters, digits, hyphens and underscores.';
    if (taken().includes(name) || composedOf(/** @type {any} */ (store).get(), layoutId)?.boxes.some((b) => b.id === name)) return `The layout already has "${name}".`;
    return null;
  }, $('te-slot-error'));
  if (!ok) return;
  const name = nameInput.value.trim();
  update((s) => addSlotBox(s, layoutId, { type: typeSelect.value, name, lookKey: lookSelect.value }));
  selectBox(name, true);
}

async function addPicture() {
  if (!store || !view.layout) return;
  const layoutId = view.layout;
  const form = el.pictureForm;
  form.reset();
  const pathSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('path'));
  const fileInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('file'));
  const images = templateImages(store.get().files.keys());
  pathSelect.replaceChildren(new Option(images.length ? 'Choose a picture of the template' : 'The template has no pictures yet', ''), ...images.map((p) => new Option(p, p)));
  const ok = await dialogResult(el.pictureDialog, () => {
    const file = fileInput.files?.[0];
    if (file && !/\.(svg|png|jpe?g|webp|gif|avif)$/i.test(file.name)) return 'Choose an SVG, PNG, JPEG, WebP, GIF or AVIF image.';
    if (!file && !pathSelect.value) return 'Choose a picture, or a new image file.';
    return null;
  }, $('te-picture-error'));
  if (!ok) return;
  const file = fileInput.files?.[0];
  /** @type {string | null} */
  let boxId = null;
  update((s) => {
    let next = s;
    let path = pathSelect.value;
    if (file) ({ state: next, path } = addImageFile(next, file.name, file));
    next = addPictureBox(next, layoutId, path);
    boxId = composedOf(next, layoutId)?.boxes.at(-1)?.id ?? null;
    return next;
  });
  if (boxId) selectBox(boxId, true);
}

// ---------------------------------------------------------------------------
// Fonts

/** @param {string} token  The font token the dialog starts with. */
async function addFontFile(token) {
  if (!store) return;
  const form = el.fontForm;
  form.reset();
  const fileInput = /** @type {HTMLInputElement} */ (form.elements.namedItem('file'));
  const family = /** @type {HTMLInputElement} */ (form.elements.namedItem('family'));
  const tokenSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('token'));
  const fonts = catalogOf(store.get()).filter((t) => t.kind === 'font');
  tokenSelect.replaceChildren(new Option('Nothing yet', ''), ...fonts.map((t) => new Option(`${t.label} (${t.name})`, t.name)));
  tokenSelect.value = token;
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file && !family.value) family.value = familyFromFileName(file.name);
  };
  const ok = await dialogResult(el.fontDialog, () => {
    const file = fileInput.files?.[0];
    if (!file) return 'Choose a font file.';
    if (!/\.(woff2|woff|ttf|otf)$/i.test(file.name)) return 'Choose a .woff2, .woff, .ttf or .otf file.';
    if (!cleanFamily(family.value)) return 'Give the font a family name.';
    return null;
  }, $('te-font-error'));
  const file = fileInput.files?.[0];
  if (!ok || !file) return;
  update((s) => addFont(s, {
    fileName: file.name,
    blob: file,
    family: family.value,
    weight: /** @type {HTMLSelectElement} */ (form.elements.namedItem('weight')).value,
    style: /** @type {HTMLSelectElement} */ (form.elements.namedItem('style')).value === 'italic' ? 'italic' : 'normal',
    token: tokenSelect.value || null,
  }));
  banner(`Added "${cleanFamily(family.value)}" (assets/fonts/). It is saved with the template.`, 'success');
}

// ---------------------------------------------------------------------------
// Preview

async function loadSamples() {
  if (samples.size) return;
  await Promise.all(SAMPLE_SHOWS.map(async (s) => {
    try {
      const response = await fetch(new URL(s.url, location.href));
      if (response.ok) samples.set(s.id, await response.json());
    } catch {
      // A missing sample show is simply not offered.
    }
  }));
}

/** @param {TemplateState} state */
function fillSampleSelect(state) {
  const options = [new Option('Generated: one slide per layout', 'generated')];
  for (const s of SAMPLE_SHOWS) {
    const show = samples.get(s.id);
    if (!show) continue;
    const { kept, total } = fitSample(show, state.template);
    const option = new Option(`${s.label} (${kept} of ${total} slides)`, s.id);
    option.disabled = kept === 0;
    options.push(option);
  }
  el.sample.replaceChildren(...options);
  el.sample.value = view.sample;
}

/**
 * Offer 4:3 only when the template draws it.
 * @param {TemplateState} state
 */
function setAspectChoice(state) {
  const fourThree = /** @type {HTMLButtonElement} */ (document.querySelector('[data-aspect="4:3"]'));
  const ok = supportsFourThree(sheetTexts(state).theme);
  fourThree.disabled = !ok;
  fourThree.title = ok ? '' : 'This template draws 16:9 slides only.';
  if (!ok && view.aspect === '4:3') {
    view.aspect = '16:9';
    for (const b of document.querySelectorAll('[data-aspect]')) b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.aspect === '16:9'));
  }
}

async function renderPreview() {
  if (!store) return;
  const state = store.get();
  el.sample.disabled = stageActive();
  if (stageActive()) {
    const sample = generatedSample(state.template);
    const slide = sample.slides.find((/** @type {any} */ s) => s.layout === view.layout);
    const show = withAspect({ ...sample, slides: slide ? [slide] : [] }, view.aspect);
    await preview.render(state, { show, showUrl: location.href, mode: view.mode, stage: true });
    updateOverlay();
    return;
  }
  overlay.update(null, null);
  const entry = SAMPLE_SHOWS.find((s) => s.id === view.sample);
  const base = entry && samples.has(entry.id)
    ? { show: fitSample(samples.get(entry.id), state.template).show, showUrl: new URL(entry.url, location.href).href }
    : { show: generatedSample(state.template), showUrl: location.href };
  await preview.render(state, { show: withAspect(base.show, view.aspect), showUrl: base.showUrl, mode: view.mode });
}

el.sample.addEventListener('change', () => {
  view.sample = el.sample.value;
  run(renderPreview);
});
for (const button of document.querySelectorAll('[data-mode], [data-aspect]')) {
  button.addEventListener('click', () => {
    const b = /** @type {HTMLElement} */ (button);
    if (b.dataset.mode) view.mode = /** @type {'audience' | 'reader'} */ (b.dataset.mode);
    if (b.dataset.aspect) view.aspect = /** @type {'16:9' | '4:3'} */ (b.dataset.aspect);
    for (const other of document.querySelectorAll(b.dataset.mode ? '[data-mode]' : '[data-aspect]')) {
      other.setAttribute('aria-pressed', String(other === b));
    }
    run(renderPreview);
  });
}

// ---------------------------------------------------------------------------
// Saving

/** Errors in template.json stop a save. @returns {boolean} */
function checkBeforeSave() {
  if (!store) return false;
  const state = store.get();
  const result = validateTemplate(syncStyleguide(state.template, state.links, catalogOf(state)));
  if (result.ok) return true;
  banner(`Not saved: ${result.errors.map((i) => `${i.path || '(root)'} ${i.message}`).join(' · ')} (see the Template tab).`, 'error');
  return false;
}

async function save() {
  if (!store || !checkBeforeSave()) return;
  if (!folder) return saveAs();
  if (!(await ensureWritable(folder))) {
    banner('Slipr may not write to the folder. Allow it, or use Save as folder…', 'error');
    return;
  }
  const state = store.get();
  const files = outputFiles(state);
  const paths = changedPaths(state);
  if (!paths.length) {
    banner('Nothing to save.', 'info');
    return;
  }
  const deleted = deletedPaths(state, files);
  await writeTemplateFiles(folder, files, paths.filter((p) => !deleted.includes(p)));
  await removeTemplateFiles(folder, deleted);
  store.update((s) => markSaved(s, files), { history: false });
  const written = paths.filter((p) => !deleted.includes(p));
  banner([written.length ? `Saved ${written.join(', ')}.` : '', deleted.length ? `Deleted ${deleted.join(', ')}.` : ''].join(' ').trim(), 'success');
}

async function saveAs() {
  if (!store || !checkBeforeSave()) return;
  const parent = await pickFolder('slipr-template-parent');
  if (!parent) return;
  const state = store.get();
  const id = state.template.id;
  let existing = false;
  try {
    const sub = await parent.getDirectoryHandle(id);
    await sub.getFileHandle('template.json');
    existing = true;
  } catch {
    // No template there yet.
  }
  if (existing && !confirm(`"${parent.name}/${id}" already holds a template. Overwrite its files?`)) return;
  const target = await parent.getDirectoryHandle(id, { create: true });
  const files = outputFiles(state);
  await writeTemplateFiles(target, files);
  folder = target;
  store.update((s) => markSaved(s, files), { history: false });
  banner(`Saved to "${parent.name}/${id}". To use it in shows, keep it in Slipr's templates/ folder and add "${id}" to templates/index.json.`, 'success');
}

async function saveZip() {
  if (!store || !checkBeforeSave()) return;
  const state = store.get();
  download(await templateZip(outputFiles(state), state.template.id), `${state.template.id}.zip`);
  banner(`Downloaded ${state.template.id}.zip. Unpack it into Slipr's templates/ folder and add "${state.template.id}" to templates/index.json.`, 'success');
}

function close() {
  if (store && changedPaths(store.get()).length && !confirm('Close the template? Unsaved changes are lost.')) return;
  folder = null;
  preview.clear();
  banner('', 'info');
  run(showStart);
}

el.undo.addEventListener('click', () => store?.undo());
el.redo.addEventListener('click', () => store?.redo());
el.save.addEventListener('click', () => run(save));
el.saveAs.addEventListener('click', () => run(saveAs));
el.zip.addEventListener('click', () => run(saveZip));
el.close.addEventListener('click', close);
el.openFolder.addEventListener('click', () => run(openFolder));

document.addEventListener('keydown', (e) => {
  if (!store || el.workspace.hidden || !(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) store.undo();
  else if (key === 'y' || (key === 'z' && e.shiftKey)) store.redo();
  else if (key === 's') run(save);
  else return;
  e.preventDefault();
});

window.addEventListener('beforeunload', (e) => {
  if (store && !el.workspace.hidden && changedPaths(store.get()).length) e.preventDefault();
});

// ---------------------------------------------------------------------------
// Helpers

/**
 * @param {string} message @param {'info' | 'success' | 'error'} kind
 */
function banner(message, kind) {
  el.banner.hidden = !message;
  el.banner.textContent = message;
  el.banner.dataset.kind = kind;
}

/** @param {() => Promise<void>} action */
function run(action) {
  action().catch((err) => {
    console.error(err);
    banner(err instanceof Error ? err.message : String(err), 'error');
  });
}

/**
 * Show a modal form dialog; resolve true on OK (after `check` passes), false on Cancel or Esc.
 * @param {HTMLDialogElement} dialog
 * @param {() => string | null} check  An error message, or null when the form is fine.
 * @param {HTMLElement} errorEl
 * @returns {Promise<boolean>}
 */
function dialogResult(dialog, check, errorEl) {
  return new Promise((resolve) => {
    const form = /** @type {HTMLFormElement} */ (dialog.querySelector('form'));
    const onSubmit = (/** @type {SubmitEvent} */ e) => {
      const submitter = /** @type {HTMLButtonElement | null} */ (e.submitter);
      if (submitter?.value !== 'ok') return finish(false);
      const problem = check();
      errorEl.textContent = problem ?? '';
      if (problem) {
        e.preventDefault();
        return;
      }
      finish(true);
    };
    const onCancel = () => finish(false);
    const finish = (/** @type {boolean} */ ok) => {
      form.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      resolve(ok);
    };
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

run(showStart);
