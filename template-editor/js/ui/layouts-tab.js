// @ts-check
/**
 * The Layouts tab of the template editor (I-111): the template's layouts,
 * their slot settings, and for composed layouts their boxes (D-019).
 * Changes go through `options.update` with a pure function from
 * `layout-actions.js`, like every other change in the app.
 */
import {
  layoutDef, composedOf, looksOf, setLayoutMeta, setSlotProp, setLayoutBackground, setLayoutClass, setBox,
  setBoxLook, renameSlot, moveBoxInOrder, removeBox,
} from '../layout-actions.js';
import { looksFor, lookKeyOf, typeLabel, isComposedHtml, isSlotName, LENGTH_TYPES, ITEM_TYPES } from '../composer/layout-model.js';
import { validateTemplate } from '../../../shared/validate.js';

/**
 * @typedef {import('../actions.js').TemplateState} TemplateState
 *
 * @typedef {object} LayoutsTabOptions
 * @property {TemplateState} state
 * @property {string | null} layout        The selected layout id.
 * @property {string | null} box           The selected box id.
 * @property {Array<{ name: string, label: string }>} colors  Colour tokens (backgrounds).
 * @property {string[]} variants           Root classes some layouts use (`cnc-dark`).
 * @property {(change: (s: TemplateState) => TemplateState, coalesceKey?: string) => void} update
 * @property {(id: string | null) => void} onSelectLayout
 * @property {(id: string | null) => void} onSelectBox
 * @property {(from: string | null) => void} onNewLayout
 * @property {() => void} onAddSlot
 * @property {() => void} onAddPicture
 * @property {(id: string) => void} onRemoveLayout
 */

/**
 * @param {HTMLElement} body
 * @param {LayoutsTabOptions} options
 */
export function renderLayoutsTab(body, options) {
  const active = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusKey = active && body.contains(active) ? active.dataset.focusKey : undefined;
  const typed = active instanceof HTMLInputElement && active.type === 'text' || active instanceof HTMLTextAreaElement ? active.value : null;
  const selection = active instanceof HTMLInputElement && active.type === 'text' || active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = body.scrollTop;

  const def = options.layout ? layoutDef(options.state, options.layout) : null;
  body.replaceChildren(def ? layoutView(def, options) : listView(options));

  body.scrollTop = scroll;
  if (focusKey) {
    const el = /** @type {HTMLInputElement | null} */ (body.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`));
    if (el) {
      if (typed !== null) el.value = typed;
      el.focus({ preventScroll: true });
      if (selection && selection[0] !== null) el.setSelectionRange(selection[0], selection[1]);
    }
  }
}

/** @param {LayoutsTabOptions} options */
function listView(options) {
  const { state } = options;
  const fragment = document.createDocumentFragment();
  const intro = document.createElement('p');
  intro.className = 'te-hint';
  intro.textContent = 'Composed layouts are arranged here, box by box. Hand-written layouts keep their HTML and CSS: you can change their slot settings, or duplicate one as a composed layout to rearrange it.';
  fragment.append(intro, button('New layout…', () => options.onNewLayout(null), 'te-primary te-block-button', 'layout:new'));
  const ul = document.createElement('ul');
  ul.className = 'te-layout-list';
  for (const def of state.template.layouts ?? []) {
    const li = document.createElement('li');
    const b = button('', () => options.onSelectLayout(def.id), 'te-layout-row', `layout:${def.id}`);
    const name = document.createElement('strong');
    name.textContent = def.name ?? def.id;
    const meta = document.createElement('span');
    meta.className = 'te-hint';
    const composed = isComposedHtml(state.files.get(def.file));
    meta.append(code(def.id), ` · ${composed ? 'composed' : 'hand-written'} · ${(def.slots ?? []).length} slot${(def.slots ?? []).length === 1 ? '' : 's'}`);
    b.append(name, meta);
    li.append(b);
    ul.append(li);
  }
  fragment.append(ul);
  return fragment;
}

/**
 * @param {any} def @param {LayoutsTabOptions} options
 */
function layoutView(def, options) {
  const { state } = options;
  const id = def.id;
  const model = composedOf(state, id);
  const fragment = document.createDocumentFragment();
  fragment.append(button('← All layouts', () => options.onSelectLayout(null), 'te-link-button', 'layout:back'));

  const h = document.createElement('h3');
  h.className = 'te-layout-title';
  h.append(def.name ?? id, ' ', code(id));
  const note = document.createElement('p');
  note.className = 'te-hint';
  note.textContent = model
    ? 'Composed: drag the boxes in the preview, or select one and use the arrow keys (Shift: 5 %, Alt: size).'
    : `Hand-written (${def.file}): its HTML and CSS stay as they are. Slot names and types are fixed, because shows use them.`;
  fragment.append(h, note);

  fragment.append(
    textField('Name', `lm:${id}:name`, def.name ?? '', (v) => options.update((s) => setLayoutMeta(s, id, 'name', v), `lm:${id}:name`), { required: true }),
    textField('Description', `lm:${id}:description`, def.description ?? '', (v) => options.update((s) => setLayoutMeta(s, id, 'description', v), `lm:${id}:description`), { multiline: true }),
  );

  if (model) {
    fragment.append(group('Look of the slide', null));
    const bg = select('Background', `bg:${id}`, [['', 'From the template'], ...options.colors.map((c) => /** @type {[string, string]} */ ([c.name, `${c.label} (${c.name})`]))], model.background ?? '',
      (v) => options.update((s) => setLayoutBackground(s, id, v || null)));
    fragment.append(bg);
    if (options.variants.length) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'te-checks';
      const legend = document.createElement('legend');
      legend.textContent = 'Variant classes (as other layouts of this template use them)';
      fieldset.append(legend);
      for (const cls of options.variants) {
        fieldset.append(checkbox(cls, `cls:${id}:${cls}`, model.classes.includes(cls), (on) => options.update((s) => setLayoutClass(s, id, cls, on)), true));
      }
      fragment.append(fieldset);
    }

    fragment.append(group('Boxes', 'In order: later boxes are drawn on top, and readers and screen readers meet them in this order.'));
    const ul = document.createElement('ul');
    ul.className = 'te-box-list';
    model.boxes.forEach((box, i) => {
      const li = document.createElement('li');
      li.classList.toggle('is-selected', box.id === options.box);
      const slot = (def.slots ?? []).find((/** @type {any} */ s) => s.name === box.slot);
      const pick = button(box.slot ? `${box.slot} · ${typeLabel(slot?.type ?? '')}` : `${box.id} · Picture`, () => options.onSelectBox(box.id === options.box ? null : box.id), 'te-box-pick', `box:${box.id}`);
      pick.setAttribute('aria-pressed', String(box.id === options.box));
      const up = button('↑', () => options.update((s) => moveBoxInOrder(s, id, box.id, -1)), 'te-step', `up:${box.id}`);
      up.disabled = i === 0;
      up.setAttribute('aria-label', `Move ${box.id} up (behind)`);
      const down = button('↓', () => options.update((s) => moveBoxInOrder(s, id, box.id, 1)), 'te-step', `down:${box.id}`);
      down.disabled = i === model.boxes.length - 1;
      down.setAttribute('aria-label', `Move ${box.id} down (in front)`);
      const remove = button('✕', () => {
        options.update((s) => removeBox(s, id, box.id));
        if (box.id === options.box) options.onSelectBox(null);
      }, 'te-step', `rm:${box.id}`);
      remove.setAttribute('aria-label', box.slot ? `Remove the box and the slot ${box.slot}` : `Remove ${box.id}`);
      li.append(pick, up, down, remove);
      ul.append(li);
    });
    fragment.append(ul);
    const adders = document.createElement('div');
    adders.className = 'te-row';
    adders.append(button('+ Slot…', options.onAddSlot, '', 'add:slot'), button('+ Picture…', options.onAddPicture, '', 'add:picture'));
    fragment.append(adders);

    const box = model.boxes.find((b) => b.id === options.box);
    if (box) fragment.append(boxInspector(def, model, box, options));
  }

  if ((def.slots ?? []).length) {
    fragment.append(group('Slot settings', 'What the show editor asks for and checks. Required slots and limits give warnings, not errors.'));
    for (const slot of def.slots) fragment.append(slotSettings(id, slot, options));
  }

  const actions = document.createElement('div');
  actions.className = 'te-row te-layout-actions';
  actions.append(button(model ? 'Duplicate…' : 'Duplicate as composed layout…', () => options.onNewLayout(id), '', 'layout:duplicate'));
  if (model) actions.append(button('Remove layout…', () => options.onRemoveLayout(id), 'te-danger', 'layout:remove'));
  fragment.append(actions);

  const i = (state.template.layouts ?? []).indexOf(def);
  const issues = [...validateTemplate(state.template).errors].filter((x) => x.path.startsWith(`layouts[${i}]`));
  if (issues.length) {
    const p = document.createElement('p');
    p.className = 'te-error';
    p.textContent = issues.map((x) => `${x.path}: ${x.message}`).join(' · ');
    fragment.append(p);
  }
  return fragment;
}

/**
 * Position, name and look of the selected box.
 * @param {any} def @param {import('../composer/layout-model.js').ComposedLayout} model
 * @param {import('../composer/layout-model.js').ComposedBox} box @param {LayoutsTabOptions} options
 */
function boxInspector(def, model, box, options) {
  const id = model.id;
  const section = document.createElement('section');
  section.className = 'te-inspector';
  section.setAttribute('aria-label', `Box ${box.id}`);
  const h = document.createElement('h4');
  h.textContent = box.slot ? `Slot box ${box.slot}` : `Picture ${box.id}`;
  section.append(h);

  const grid = document.createElement('div');
  grid.className = 'te-area-fields';
  for (const [key, label] of /** @type {const} */ ([['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']])) {
    const wrap = document.createElement('label');
    wrap.append(`${label} %`);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = key === 'w' || key === 'h' ? '1' : '0';
    input.max = key === 'w' || key === 'h' ? '100' : '99';
    input.step = '1';
    input.value = String(box.area[key]);
    input.dataset.focusKey = `area:${box.id}:${key}`;
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (input.value === '' || !Number.isInteger(n)) return;
      options.update((s) => setBox(s, id, box.id, { area: { ...box.area, [key]: n } }), `area:${id}:${box.id}:${key}`);
    });
    wrap.append(input);
    grid.append(wrap);
  }
  section.append(grid);

  if (!box.slot) {
    const src = /src="([^"]*)"/.exec(box.markup)?.[1] ?? '';
    const p = document.createElement('p');
    p.className = 'te-hint';
    p.append('Picture ', code(src));
    section.append(p, select('Fit', `fit:${box.id}`, [['contain', 'Contain: the whole picture'], ['cover', 'Cover: fill the box, cropped'], ['fill', 'Stretch to the box']], box.fit ?? 'contain',
      (v) => options.update((s) => setBox(s, id, box.id, { fit: /** @type {any} */ (v) }))));
    return section;
  }

  const slot = (def.slots ?? []).find((/** @type {any} */ s) => s.name === box.slot);
  section.append(textField('Slot name', `name:${box.id}`, box.slot, (v) => options.update((s) => renameSlot(s, id, /** @type {string} */ (box.slot), v)), {
    hint: 'Shows store the content under this name: rename only while no show uses the layout.',
    check: (v) => (!isSlotName(v) ? 'Letters, digits, hyphens and underscores.' : v !== box.slot && model.boxes.some((b) => b.id === v) ? 'Another box has this name.' : null),
    commit: true,
  }));
  const looks = looksFor(looksOf(options.state), slot?.type ?? 'text', box.slot);
  const current = lookKeyOf(looks, box.markup, slot?.type ?? 'text');
  const choices = looks.map((l) => /** @type {[string, string]} */ ([l.key, l.label]));
  if (!current) choices.unshift(['', 'As copied from the layout']);
  section.append(select(`Look (${typeLabel(slot?.type ?? '')})`, `look:${box.id}`, choices, current ?? '',
    (v) => { if (v) options.update((s) => setBoxLook(s, id, box.id, v)); }));
  const hint = document.createElement('p');
  hint.className = 'te-hint';
  hint.textContent = 'A look is how one of the template\'s own layouts draws this kind of slot: its element and classes.';
  section.append(hint);
  return section;
}

/** Slot settings the author opened (layout id:slot name), kept while the panel is rebuilt. */
const openSlots = new Set();

/**
 * @param {string} id @param {any} slot @param {LayoutsTabOptions} options
 */
function slotSettings(id, slot, options) {
  const details = document.createElement('details');
  details.className = 'te-slot';
  // The selected box's slot is open; details elements keep their state across rebuilds by name.
  details.open = slot.name === options.box || openSlots.has(`${id}:${slot.name}`);
  details.addEventListener('toggle', () => {
    if (details.open) openSlots.add(`${id}:${slot.name}`);
    else openSlots.delete(`${id}:${slot.name}`);
  });
  const summary = document.createElement('summary');
  summary.append(code(slot.name), ` · ${typeLabel(slot.type)}${slot.required ? ' · required' : ''}`);
  details.append(summary);
  const key = (/** @type {string} */ prop) => `slot:${id}:${slot.name}:${prop}`;
  const set = (/** @type {any} */ prop, /** @type {any} */ value) => options.update((s) => setSlotProp(s, id, slot.name, prop, value), key(prop));
  details.append(
    textField('Label', key('label'), slot.label ?? '', (v) => set('label', v)),
    textField('Help', key('help'), slot.help ?? '', (v) => set('help', v)),
    checkbox('Required', key('required'), Boolean(slot.required), (on) => set('required', on)),
  );
  const number = (/** @type {string} */ label, /** @type {'maxLength' | 'maxItems'} */ prop) => {
    const wrap = document.createElement('label');
    wrap.className = 'te-field';
    wrap.append(label);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.placeholder = 'No limit';
    input.value = slot[prop] ? String(slot[prop]) : '';
    input.dataset.focusKey = key(prop);
    input.addEventListener('input', () => {
      if (input.value === '') return set(prop, null);
      const n = Number(input.value);
      if (Number.isInteger(n) && n >= 1) set(prop, n);
    });
    wrap.append(input);
    return wrap;
  };
  if (LENGTH_TYPES.has(slot.type)) details.append(number('Maximum length (characters)', 'maxLength'));
  if (ITEM_TYPES.has(slot.type)) details.append(number(slot.type === 'cards' ? 'Maximum cards' : 'Maximum items', 'maxItems'));
  if (slot.type === 'cards' && slot.fields?.length) {
    const p = document.createElement('p');
    p.className = 'te-hint';
    p.textContent = `Card fields: ${slot.fields.map((/** @type {any} */ f) => `${f.name} (${typeLabel(f.type)})`).join(', ')}.`;
    details.append(p);
  }
  return details;
}

// ---------------------------------------------------------------------------
// Small builders

/**
 * @param {string} label @param {() => void} onClick @param {string} className @param {string} focusKey
 */
function button(label, onClick, className, focusKey) {
  const b = document.createElement('button');
  b.type = 'button';
  if (className) b.className = className;
  b.textContent = label;
  b.dataset.focusKey = focusKey;
  b.addEventListener('click', onClick);
  return b;
}

/** @param {string} text */
function code(text) {
  const c = document.createElement('code');
  c.textContent = text;
  return c;
}

/** @param {string} text @param {string | null} note */
function group(text, note) {
  const section = document.createElement('div');
  section.className = 'te-group';
  const h3 = document.createElement('h3');
  h3.textContent = text;
  section.append(h3);
  if (note) {
    const p = document.createElement('p');
    p.className = 'te-hint';
    p.textContent = note;
    section.append(p);
  }
  return section;
}

/**
 * A text field; `commit` applies the value on change (Enter or leaving the field) instead of per keystroke.
 * @param {string} label @param {string} key @param {string} value @param {(v: string) => void} onChange
 * @param {{ hint?: string, multiline?: boolean, required?: boolean, check?: (v: string) => string | null, commit?: boolean }} [options]
 */
function textField(label, key, value, onChange, options = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'te-field';
  wrap.append(label);
  const input = options.multiline ? document.createElement('textarea') : document.createElement('input');
  input.dataset.focusKey = key;
  input.value = value;
  if (input instanceof HTMLInputElement) {
    input.type = 'text';
    input.autocomplete = 'off';
  }
  const error = document.createElement('span');
  error.className = 'te-error';
  const check = () => {
    const problem = options.check?.(input.value) ?? (options.required && !input.value.trim() ? 'Required.' : null);
    input.setAttribute('aria-invalid', String(Boolean(problem)));
    error.textContent = problem ?? '';
    return problem;
  };
  input.addEventListener('input', () => {
    if (!check() && !options.commit) onChange(input.value);
  });
  if (options.commit) input.addEventListener('change', () => { if (!check()) onChange(input.value); });
  wrap.append(input);
  if (options.hint) {
    const hint = document.createElement('span');
    hint.className = 'te-hint';
    hint.textContent = options.hint;
    wrap.append(hint);
  }
  wrap.append(error);
  return wrap;
}

/**
 * @param {string} label @param {string} key @param {Array<[string, string]>} choices @param {string} value
 * @param {(v: string) => void} onChange
 */
function select(label, key, choices, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'te-field';
  wrap.append(label);
  const sel = document.createElement('select');
  sel.dataset.focusKey = key;
  sel.append(...choices.map(([v, text]) => new Option(text, v)));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.append(sel);
  return wrap;
}

/**
 * @param {string} label @param {string} key @param {boolean} checked @param {(on: boolean) => void} onChange @param {boolean} [mono]
 */
function checkbox(label, key, checked, onChange, mono = false) {
  const wrap = document.createElement('label');
  wrap.className = 'te-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.focusKey = key;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, mono ? code(label) : label);
  return wrap;
}
