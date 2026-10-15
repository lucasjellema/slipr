// @ts-check
/**
 * The token tabs of the template editor (I-106): Colours, Type, Sizes and
 * Other. Each token is a row: its label and name, a "linked to" select, the
 * value (with a colour swatch, font suggestions or − / + steps) and, for
 * colours, its contrast badges. The panel is rebuilt on every change; the
 * field being typed in keeps its text, caret and focus.
 */
import { checkValue } from '../css-tokens.js';
import { parseColor, toHex } from '../color.js';
import { linkCandidates, dependents } from '../token-catalog.js';
import { withFamilyFirst } from '../actions.js';

/**
 * @typedef {import('../token-catalog.js').Token} Token
 * @typedef {import('../contrast-pairs.js').ContrastResult} ContrastResult
 *
 * @typedef {object} TokenPanelOptions
 * @property {Token[]} catalog
 * @property {'color' | 'font' | 'size' | 'other'} kind
 * @property {string} filter
 * @property {ContrastResult[]} contrast
 * @property {string[]} families  Font families of the template's @font-face rules.
 * @property {(name: string, value: string, source: 'typing' | 'swatch' | 'click') => void} onSet
 *   'typing' and 'swatch' coalesce into one undo step; while a swatch is dragged the panel is not rebuilt (that would close the colour picker).
 * @property {() => void} onRefresh  Rebuild the panel (when the colour picker closes).
 * @property {(token: string) => void} onAddFont
 */

/** Font stacks offered besides the template's own families. */
export const FONT_STACKS = [
  { label: 'System UI', value: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { label: 'Arial / Helvetica', value: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, "Cascadia Code", Consolas, Menlo, monospace' },
];

/** CSS property used to check a value of each kind with CSS.supports(). */
const SUPPORTS = { color: 'color', font: 'font-family', size: 'width', other: '' };

/**
 * Render the rows of one kind into `body`.
 * @param {HTMLElement} body
 * @param {TokenPanelOptions} options
 */
export function renderTokenPanel(body, options) {
  const focus = rememberFocus(body);
  const scroll = body.scrollTop;
  const fragment = document.createDocumentFragment();
  if (options.kind === 'color') fragment.append(contrastSummary(options.contrast));

  const words = options.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tokens = options.catalog.filter((t) => t.kind === options.kind
    && words.every((w) => `${t.name} ${t.label} ${t.group} ${t.value}`.toLowerCase().includes(w)));
  if (!tokens.length) {
    const p = document.createElement('p');
    p.className = 'te-empty';
    p.textContent = words.length ? 'No tokens match the filter.' : 'This template has no tokens of this kind.';
    fragment.append(p);
  }

  /** @type {HTMLElement | null} */
  let groupEl = null;
  let groupName = null;
  for (const token of tokens) {
    if (token.group !== groupName || !groupEl) {
      groupName = token.group;
      groupEl = document.createElement('section');
      groupEl.className = 'te-group';
      const h3 = document.createElement('h3');
      h3.textContent = token.group || 'Tokens';
      groupEl.append(h3);
      if (token.groupNote) groupEl.append(hint(token.groupNote));
      fragment.append(groupEl);
    }
    groupEl.append(tokenRow(token, options));
  }
  body.replaceChildren(fragment);
  body.scrollTop = scroll;
  restoreFocus(body, focus);
}

/**
 * @param {Token} token @param {TokenPanelOptions} options
 * @returns {HTMLElement}
 */
function tokenRow(token, options) {
  const row = document.createElement('div');
  row.className = 'te-token';
  row.id = rowId(token.name);
  row.dataset.name = token.name;

  const id = `te-value-${token.name.slice(2)}`;
  const head = document.createElement('div');
  head.className = 'te-token-head';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = token.label;
  const code = document.createElement('code');
  code.textContent = token.name;
  head.append(label, code);
  row.append(head);

  const controls = document.createElement('div');
  controls.className = 'te-token-controls';

  // Linked to another token, or an own value.
  const candidates = linkCandidates(options.catalog, token.name);
  if (candidates.length) {
    const select = document.createElement('select');
    select.className = 'te-link';
    select.dataset.focusKey = 'link';
    select.setAttribute('aria-label', `${token.label}: linked to`);
    select.append(new Option('Own value', ''));
    for (const c of candidates) select.append(new Option(`= ${c.label} (${c.name})`, c.name));
    select.value = token.linked && candidates.some((c) => c.name === token.linked) ? token.linked : '';
    if (token.linked && select.value === '') {
      select.append(new Option(`= ${token.linked}`, token.linked));
      select.value = token.linked;
    }
    select.addEventListener('change', () => {
      options.onSet(token.name, select.value ? `var(${select.value})` : token.resolved ?? token.value, 'click');
    });
    controls.append(select);
  }

  const color = token.kind === 'color' ? parseColor(token.resolved ?? '') : null;
  if (token.kind === 'color') {
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.dataset.focusKey = 'swatch';
    swatch.setAttribute('aria-label', `${token.label}: pick a colour`);
    swatch.value = color ? toHex(color).toLowerCase() : '#000000';
    swatch.disabled = !color || color.a !== 1;
    if (swatch.disabled) swatch.title = 'The value has transparency; type it in the field.';
    swatch.addEventListener('input', () => options.onSet(token.name, swatch.value.toUpperCase(), 'swatch'));
    swatch.addEventListener('change', () => options.onRefresh());
    controls.append(swatch);
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'te-value';
  input.dataset.focusKey = 'value';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.value = token.linked ? token.resolved ?? '' : token.value;
  if (token.linked) {
    input.classList.add('is-linked');
    input.title = `Comes from ${token.linked}. Type a value to give this token its own.`;
  }
  const error = document.createElement('p');
  error.className = 'te-error';
  error.setAttribute('aria-live', 'polite');
  input.addEventListener('input', () => {
    const problem = valueProblem(input.value, token.kind);
    input.setAttribute('aria-invalid', String(Boolean(problem)));
    error.textContent = problem ?? '';
    if (!problem) options.onSet(token.name, input.value, 'typing');
  });
  controls.append(input);

  if (token.kind === 'size' && /^-?[\d.]+[a-z%]*$/i.test((token.linked ? token.resolved : token.value) ?? '')) {
    for (const [text, sign] of /** @type {const} */ ([['−', -1], ['+', 1]])) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'te-step';
      button.dataset.focusKey = `step${sign}`;
      button.textContent = text;
      button.setAttribute('aria-label', `${sign < 0 ? 'Smaller' : 'Larger'} ${token.label}`);
      button.addEventListener('click', () => options.onSet(token.name, stepValue((token.linked ? token.resolved : token.value) ?? '', sign), 'click'));
      controls.append(button);
    }
  }
  row.append(controls);

  if (token.kind === 'font') row.append(fontControls(token, options));
  row.append(error);

  if (token.kind === 'color') {
    const results = options.contrast.filter((r) => r.fg === token.name || r.bg === token.name);
    if (results.length) row.append(badges(results, token.name));
  }

  const notes = [];
  if (token.note) notes.push(token.note);
  const users = dependents(options.catalog, token.name);
  if (users.length) notes.push(`Used by ${users.length === 1 ? users[0] : `${users.length} tokens`}.`);
  if (token.sheet === 'reader') notes.push('In reader.css.');
  if (notes.length) row.append(hint(notes.join(' ')));
  return row;
}

/**
 * Suggestions for a font token: the template's families and common stacks, and Add font file.
 * @param {Token} token @param {TokenPanelOptions} options
 */
function fontControls(token, options) {
  const wrap = document.createElement('div');
  wrap.className = 'te-token-controls';
  const select = document.createElement('select');
  select.dataset.focusKey = 'font';
  select.setAttribute('aria-label', `${token.label}: use a font`);
  select.append(new Option('Use a font…', ''));
  if (options.families.length) {
    const group = document.createElement('optgroup');
    group.label = 'In this template';
    for (const f of options.families) group.append(new Option(f, `family:${f}`));
    select.append(group);
  }
  const stacks = document.createElement('optgroup');
  stacks.label = 'On most computers';
  for (const s of FONT_STACKS) stacks.append(new Option(s.label, `stack:${s.value}`));
  select.append(stacks);
  select.addEventListener('change', () => {
    const [type, value] = [select.value.slice(0, select.value.indexOf(':')), select.value.slice(select.value.indexOf(':') + 1)];
    if (!type) return;
    const current = (token.linked ? token.resolved : token.value) ?? '';
    options.onSet(token.name, type === 'family' ? withFamilyFirst(current, value) : value, 'click');
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.dataset.focusKey = 'add-font';
  add.textContent = 'Add font file…';
  add.addEventListener('click', () => options.onAddFont(token.name));
  wrap.append(select, add);
  return wrap;
}

/**
 * The contrast summary at the top of the Colours tab.
 * @param {ContrastResult[]} results
 */
function contrastSummary(results) {
  const box = document.createElement('section');
  box.className = 'te-contrast';
  box.setAttribute('aria-label', 'Contrast');
  const h3 = document.createElement('h3');
  h3.textContent = 'Contrast (WCAG AA)';
  box.append(h3);
  const failing = results.filter((r) => !r.pass);
  const p = document.createElement('p');
  if (!results.length) p.textContent = 'This template has none of the colour pairs Slipr checks.';
  else if (!failing.length) p.textContent = `All ${results.length} checks pass.`;
  else p.textContent = `${failing.length} of ${results.length} checks are below AA:`;
  box.append(p);
  if (failing.length) box.append(resultList(failing));
  if (results.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'All checks';
    details.append(summary, resultList(results));
    box.append(details);
  }
  return box;
}

/** @param {ContrastResult[]} results */
function resultList(results) {
  const ul = document.createElement('ul');
  for (const r of results) {
    const li = document.createElement('li');
    if (!r.pass) li.className = 'is-fail';
    const a = document.createElement('a');
    a.href = `#${rowId(r.fg)}`;
    a.textContent = r.label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      flashRow(r.fg);
    });
    li.append(a, ` ${r.ratio.toFixed(2)} : 1 ${r.pass ? '✓' : `✗ (needs ${r.min})`}`);
    ul.append(li);
  }
  return ul;
}

/** @param {ContrastResult[]} results @param {string} name */
function badges(results, name) {
  const wrap = document.createElement('div');
  wrap.className = 'te-badges';
  for (const r of results) {
    const b = document.createElement('span');
    b.className = 'te-badge';
    b.dataset.pass = String(r.pass);
    const other = r.fg === name ? r.bg : r.fg;
    b.title = `${r.label}: ${r.fg} on ${r.bg}, ${r.ratio.toFixed(2)} : 1, needs ${r.min} : 1`;
    b.textContent = `${r.pass ? '✓' : '✗'} ${r.ratio.toFixed(1)} ${r.fg === name ? 'on' : 'under'} ${other.replace(/^--slipr-(color-)?/, '')}`;
    wrap.append(b);
  }
  return wrap;
}

/**
 * Bring a token's row into view and highlight it briefly.
 * @param {string} name
 */
export function flashRow(name) {
  const row = document.getElementById(rowId(name));
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: document.hidden ? 'instant' : 'smooth' });
  row.classList.add('is-flash');
  /** @type {HTMLElement | null} */ (row.querySelector('.te-value'))?.focus({ preventScroll: true });
  setTimeout(() => row.classList.remove('is-flash'), 1500);
}

/** @param {string} name */
export function rowId(name) {
  return `te-token-${name.slice(2)}`;
}

/**
 * Why a typed value cannot be used, or null.
 * @param {string} value @param {Token['kind']} kind
 * @returns {string | null}
 */
export function valueProblem(value, kind) {
  const problem = checkValue(value);
  if (problem) return problem;
  const property = SUPPORTS[kind];
  if (!property || /var\(/.test(value) || typeof CSS === 'undefined') return null;
  const ok = CSS.supports(property, value) || (kind === 'size' && CSS.supports('line-height', value));
  return ok ? null : `Not a valid ${kind === 'size' ? 'size' : kind === 'font' ? 'font list' : 'colour'}.`;
}

/**
 * One step up or down for a number with a unit: 10 % of it, rounded sensibly.
 * @param {string} value @param {number} sign
 * @returns {string}
 */
export function stepValue(value, sign) {
  const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(value.trim());
  if (!m) return value;
  const n = Number.parseFloat(m[1]);
  const step = Math.max(Math.abs(n) * 0.1, m[2] ? 0.05 : 0.05);
  const decimals = Math.min(3, Math.max(0, (m[1].split('.')[1] ?? '').length, step < 1 ? 2 : 0));
  const next = Math.round((n + sign * step) * 10 ** decimals) / 10 ** decimals;
  return `${Math.max(0, next)}${m[2]}`;
}

/** @param {string} text */
function hint(text) {
  const p = document.createElement('p');
  p.className = 'te-hint';
  p.textContent = text;
  return p;
}

/**
 * @param {HTMLElement} body
 * @returns {{ name: string, key: string, value: string, start: number | null, end: number | null } | null}
 */
function rememberFocus(body) {
  const el = /** @type {HTMLElement | null} */ (document.activeElement);
  if (!el || !body.contains(el)) return null;
  const row = /** @type {HTMLElement | null} */ (el.closest('.te-token'));
  if (!row || !el.dataset.focusKey) return null;
  const input = el instanceof HTMLInputElement && el.type === 'text' ? el : null;
  return {
    name: row.dataset.name ?? '',
    key: el.dataset.focusKey,
    value: input ? input.value : '',
    start: input ? input.selectionStart : null,
    end: input ? input.selectionEnd : null,
  };
}

/**
 * @param {HTMLElement} body
 * @param {ReturnType<typeof rememberFocus>} focus
 */
function restoreFocus(body, focus) {
  if (!focus) return;
  const row = body.querySelector(`.te-token[data-name="${CSS.escape(focus.name)}"]`);
  const el = /** @type {HTMLElement | null} */ (row?.querySelector(`[data-focus-key="${focus.key}"]`) ?? null);
  if (!el) return;
  if (el instanceof HTMLInputElement && el.type === 'text') {
    // The field being typed in keeps what the user typed (the stored value is trimmed).
    el.value = focus.value;
    el.classList.remove('is-linked');
    el.focus({ preventScroll: true });
    if (focus.start !== null) el.setSelectionRange(focus.start, focus.end);
  } else {
    el.focus({ preventScroll: true });
  }
}
