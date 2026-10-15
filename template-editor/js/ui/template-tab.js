// @ts-check
/**
 * The Template tab of the template editor (I-106): name, id, version,
 * description, the style guide's font descriptions, the style guide colours
 * (read-only: they follow their tokens) and the template's validation.
 */
import { parseColor, toHex } from '../color.js';
import { isTemplateId } from '../template-files.js';
import { validateTemplate } from '../../../shared/validate.js';

/**
 * @typedef {object} TemplateTabOptions
 * @property {any} template   The template.json as it will be saved (style guide synced).
 * @property {Map<string, string>} links  Style guide colour → token.
 * @property {(field: 'id' | 'name' | 'version' | 'description', value: string) => void} onMeta
 * @property {(key: string, value: string) => void} onFont
 * @property {(token: string) => void} onShowToken
 */

/**
 * @param {HTMLElement} body
 * @param {TemplateTabOptions} options
 */
export function renderTemplateTab(body, options) {
  const active = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusKey = active && body.contains(active) ? active.dataset.focusKey : undefined;
  const typed = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.value : null;
  const selection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = body.scrollTop;

  const { template } = options;
  const fragment = document.createDocumentFragment();

  fragment.append(
    field('Name', 'meta:name', template.name ?? '', (v) => options.onMeta('name', v), { required: true }),
    field('Id', 'meta:id', template.id ?? '', (v) => options.onMeta('id', v), {
      hint: 'The folder name shows refer to: lower case letters, digits and hyphens.',
      check: (v) => (isTemplateId(v) ? null : 'Use lower case letters, digits and single hyphens.'),
    }),
    field('Version', 'meta:version', template.version ?? '', (v) => options.onMeta('version', v), {
      hint: 'Raise it when you change the template, so shows can ask for a version range.',
      check: (v) => (/^\d+\.\d+\.\d+$/.test(v) ? null : 'A version like 1.2.0.'),
    }),
    field('Description', 'meta:description', template.description ?? '', (v) => options.onMeta('description', v), { multiline: true }),
  );

  const fonts = template.styleguide?.fonts ?? {};
  if (Object.keys(fonts).length) {
    fragment.append(heading('Style guide fonts', 'Descriptions for people (the editor and the AI prompt kit show them); the fonts themselves are set on the Type tab.'));
    for (const [key, value] of Object.entries(fonts)) {
      fragment.append(field(capitalise(key), `font:${key}`, String(value), (v) => options.onFont(key, v)));
    }
  }

  const colors = template.styleguide?.colors ?? {};
  if (Object.keys(colors).length) {
    fragment.append(heading('Style guide colours', 'They follow their token when you save.'));
    const ul = document.createElement('ul');
    ul.className = 'te-swatch-list';
    for (const [key, value] of Object.entries(colors)) {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'te-swatch';
      const c = parseColor(String(value));
      if (c) swatch.style.background = toHex(c);
      li.append(swatch, `${key} ${value} `);
      const token = options.links.get(key);
      if (token) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = `follows ${token}`;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          options.onShowToken(token);
        });
        li.append(a);
      } else {
        const span = document.createElement('span');
        span.className = 'te-hint';
        span.textContent = '(no token found; edit template.json to change it)';
        li.append(span);
      }
      ul.append(li);
    }
    fragment.append(ul);
  }

  const result = validateTemplate(template);
  fragment.append(heading('Checks', null));
  const p = document.createElement('p');
  p.className = result.ok && !result.warnings.length ? 'te-hint' : 'te-error';
  p.textContent = result.ok && !result.warnings.length
    ? 'template.json is valid.'
    : [...result.errors, ...result.warnings].map((i) => `${i.path || '(root)'}: ${i.message}`).join(' · ');
  fragment.append(p);

  body.replaceChildren(fragment);
  body.scrollTop = scroll;
  if (focusKey) {
    const el = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (body.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`));
    if (el) {
      if (typed !== null) el.value = typed;
      el.focus({ preventScroll: true });
      if (selection && selection[0] !== null) el.setSelectionRange(selection[0], selection[1]);
    }
  }
}

/**
 * @param {string} label @param {string} key @param {string} value
 * @param {(value: string) => void} onChange
 * @param {{ hint?: string, multiline?: boolean, required?: boolean, check?: (v: string) => string | null }} [options]
 */
function field(label, key, value, onChange, options = {}) {
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
  input.addEventListener('input', () => {
    const problem = options.check?.(input.value) ?? (options.required && !input.value.trim() ? 'Required.' : null);
    input.setAttribute('aria-invalid', String(Boolean(problem)));
    error.textContent = problem ?? '';
    if (!problem) onChange(input.value);
  });
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

/** @param {string} text @param {string | null} note */
function heading(text, note) {
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

/** @param {string} s */
function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
