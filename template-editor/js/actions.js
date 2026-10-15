// @ts-check
/**
 * The open template and every change to it, as pure functions (I-106).
 * DOM-free, so they are tested in Node. State is never mutated: each change
 * returns a new state, which is what undo relies on.
 */
import { setTokenValue, addFontFace, cleanFamily } from './css-tokens.js';
import { buildCatalog } from './token-catalog.js';
import { sheetPaths, styleguideLinks, syncStyleguide } from './template-files.js';
import { patchJsonText } from './json-text.js';

/**
 * @typedef {string | Blob} FileContent
 *
 * @typedef {object} TemplateState
 * @property {any} template                  template.json, parsed and edited.
 * @property {Map<string, FileContent>} files  Every file except template.json, by path.
 * @property {Map<string, FileContent>} saved  The files as last loaded or saved, template.json included (as text).
 * @property {string} templateText           template.json as written, the base its changes are patched into.
 * @property {Map<string, string>} links     Style guide colour → token (found when opened).
 */

/**
 * The state of a template just read.
 * @param {Map<string, FileContent>} files  Every file, template.json included (as text).
 * @returns {TemplateState}
 */
export function openTemplate(files) {
  const text = files.get('template.json');
  if (typeof text !== 'string') throw new Error('The folder has no template.json.');
  const template = JSON.parse(text);
  const rest = new Map(files);
  rest.delete('template.json');
  const state = { template, files: rest, saved: new Map(files), templateText: text, links: new Map() };
  return { ...state, links: styleguideLinks(template, catalogOf(state)) };
}

/** @type {WeakMap<object, { theme: any, reader: any, catalog: import('./token-catalog.js').Token[] }>} */
const catalogs = new WeakMap();

/**
 * The tokens of the state's stylesheets (cached per files map).
 * @param {Pick<TemplateState, 'template' | 'files'>} state
 * @returns {import('./token-catalog.js').Token[]}
 */
export function catalogOf(state) {
  const { theme, reader } = sheetTexts(state);
  const cached = catalogs.get(state.files);
  if (cached && cached.theme === theme && cached.reader === reader) return cached.catalog;
  const catalog = buildCatalog({ theme, reader });
  catalogs.set(state.files, { theme, reader, catalog });
  return catalog;
}

/**
 * The text of the theme and reader stylesheets.
 * @param {Pick<TemplateState, 'template' | 'files'>} state
 * @returns {{ theme: string, reader: string | null }}
 */
export function sheetTexts(state) {
  const paths = sheetPaths(state.template);
  const theme = state.files.get(paths.theme);
  const reader = paths.reader ? state.files.get(paths.reader) : null;
  return { theme: typeof theme === 'string' ? theme : '', reader: typeof reader === 'string' ? reader : null };
}

/**
 * Set a token's value (in the stylesheet with its winning declaration).
 * @param {TemplateState} state @param {string} name @param {string} value
 * @returns {TemplateState}
 */
export function setToken(state, name, value) {
  const token = catalogOf(state).find((t) => t.name === name);
  if (!token) throw new Error(`Unknown token ${name}.`);
  if (token.value === value.trim()) return state;
  const path = sheetPaths(state.template)[token.sheet];
  if (!path) return state;
  const css = /** @type {string} */ (state.files.get(path));
  const files = new Map(state.files);
  files.set(path, setTokenValue(css, name, value));
  return { ...state, files };
}

/** The template.json fields the Template tab edits. */
export const META_FIELDS = /** @type {const} */ (['id', 'name', 'version', 'description']);

/**
 * Set a top-level field of template.json (id, name, version, description).
 * @param {TemplateState} state @param {typeof META_FIELDS[number]} field @param {string} value
 * @returns {TemplateState}
 */
export function setMeta(state, field, value) {
  if (!META_FIELDS.includes(field)) throw new Error(`${field} cannot be edited here.`);
  if (state.template[field] === value) return state;
  return { ...state, template: { ...state.template, [field]: value } };
}

/**
 * Set a font description of the style guide (`styleguide.fonts.<key>`).
 * @param {TemplateState} state @param {string} key @param {string} value
 * @returns {TemplateState}
 */
export function setStyleguideFont(state, key, value) {
  const styleguide = state.template.styleguide ?? {};
  const fonts = styleguide.fonts ?? {};
  if (fonts[key] === value) return state;
  return { ...state, template: { ...state.template, styleguide: { ...styleguide, fonts: { ...fonts, [key]: value } } } };
}

/**
 * Add a font file: copy it to `assets/fonts/`, add an @font-face rule to the
 * theme stylesheet, and optionally put the family first in a font token.
 * @param {TemplateState} state
 * @param {{ fileName: string, blob: Blob, family: string, weight?: string, style?: 'normal' | 'italic', token?: string | null }} font
 * @returns {TemplateState}
 */
export function addFont(state, font) {
  const family = cleanFamily(font.family);
  const name = font.fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/\.(woff2|woff|ttf|otf)$/.test(name)) throw new Error('Choose a .woff2, .woff, .ttf or .otf file.');
  const path = uniquePath(state.files, `assets/fonts/${name}`);
  const themePath = sheetPaths(state.template).theme;
  const src = relativePath(themePath, path);
  const files = new Map(state.files);
  files.set(path, font.blob);
  files.set(themePath, addFontFace(/** @type {string} */ (state.files.get(themePath)), { family, src, weight: font.weight, style: font.style }));
  let next = { ...state, files };
  if (font.token) {
    const token = catalogOf(next).find((t) => t.name === font.token);
    if (token) next = setToken(next, font.token, withFamilyFirst(token.linked ? token.resolved ?? '' : token.value, family));
  }
  return next;
}

/**
 * A font stack with `family` first (and not repeated further on).
 * @param {string} stack @param {string} family
 * @returns {string}
 */
export function withFamilyFirst(stack, family) {
  const parts = stack.split(',').map((s) => s.trim()).filter(Boolean)
    .filter((s) => s.replace(/^["']|["']$/g, '').toLowerCase() !== family.toLowerCase());
  return [`"${family}"`, ...parts].join(', ');
}

/**
 * A path that is not taken yet: `a.woff2`, `a-2.woff2`, …
 * @param {Map<string, unknown>} files @param {string} path
 */
function uniquePath(files, path) {
  if (!files.has(path)) return path;
  const dot = path.lastIndexOf('.');
  for (let n = 2; ; n += 1) {
    const candidate = `${path.slice(0, dot)}-${n}${path.slice(dot)}`;
    if (!files.has(candidate)) return candidate;
  }
}

/**
 * The path of `target` relative to the folder of `from` (both relative to the template).
 * @param {string} from @param {string} target
 */
export function relativePath(from, target) {
  const base = from.split('/').slice(0, -1);
  const parts = target.split('/');
  let common = 0;
  while (common < base.length && base[common] === parts[common]) common += 1;
  return [...base.slice(common).map(() => '..'), ...parts.slice(common)].join('/');
}

/**
 * The files to write: everything, with template.json written as a patch of
 * its original text and its style guide colours following their tokens.
 * @param {TemplateState} state
 * @returns {Map<string, FileContent>}
 */
export function outputFiles(state) {
  const template = syncStyleguide(state.template, state.links, catalogOf(state));
  const text = patchJsonText(state.templateText, JSON.parse(state.templateText), template);
  return new Map([['template.json', text], ...state.files]);
}

/**
 * The paths that differ from the last load or save.
 * @param {TemplateState} state
 * @returns {string[]}
 */
export function changedPaths(state) {
  const out = [];
  for (const [path, content] of outputFiles(state)) {
    if (state.saved.get(path) !== content) out.push(path);
  }
  return out;
}

/**
 * The state after saving `files`: they are the new saved versions.
 * @param {TemplateState} state @param {Map<string, FileContent>} files
 * @returns {TemplateState}
 */
export function markSaved(state, files) {
  const text = files.get('template.json');
  return { ...state, saved: new Map(files), templateText: typeof text === 'string' ? text : state.templateText };
}

/**
 * A clone of the state as a new template: new template.json and README, and
 * nothing counts as saved yet.
 * @param {TemplateState} state
 * @param {{ template: any, readme: string }} clone
 * @returns {TemplateState}
 */
export function asClone(state, clone) {
  const files = new Map(state.files);
  files.set('README.md', clone.readme);
  return { ...state, template: clone.template, files, saved: new Map() };
}
