// @ts-check
/**
 * Template files, clones and the style guide (I-106). DOM-free.
 */
import { cssUrls, htmlUrls, cleanFamily } from './css-tokens.js';
import { parseColor, toHex } from './color.js';

/** Files that are read and written as text; everything else is binary. */
const TEXT_FILE = /\.(json|css|html?|md|txt|js|svg)$/i;

/**
 * Is this file kept as text?
 * @param {string} path
 */
export function isTextFile(path) {
  return TEXT_FILE.test(path);
}

/**
 * A path relative to the template folder, from a reference in `fromFile`.
 * Null when it leaves the folder or is not relative.
 * @param {string} fromFile  e.g. `layouts/title.html`
 * @param {string} ref       e.g. `../assets/logo.svg`
 * @returns {string | null}
 */
export function joinPath(fromFile, ref) {
  const clean = ref.split(/[?#]/)[0];
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(clean)) return null;
  const parts = fromFile.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(decodeURIComponent(part));
    }
  }
  return parts.join('/') || null;
}

/**
 * The stylesheet paths of a template.
 * @param {any} template
 * @returns {{ theme: string, reader: string | null }}
 */
export function sheetPaths(template) {
  return { theme: template?.theme ?? 'theme.css', reader: template?.reader ?? null };
}

/**
 * Every file a template refers to, relative to its folder: template.json,
 * the stylesheets, the layouts, and what those refer to.
 * @param {any} template
 * @param {(path: string) => string | null} readText  Text of a file already read (stylesheets, layouts).
 * @returns {string[]}
 */
export function referencedFiles(template, readText) {
  const { theme, reader } = sheetPaths(template);
  const files = ['template.json', theme];
  if (reader) files.push(reader);
  for (const layout of template?.layouts ?? []) if (typeof layout?.file === 'string') files.push(layout.file);
  const out = [...files];
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    const refs = file.endsWith('.css') ? cssUrls(text) : file.endsWith('.html') ? htmlUrls(text) : [];
    for (const ref of refs) {
      const path = joinPath(file, ref);
      if (path && !out.includes(path)) out.push(path);
    }
  }
  return out;
}

/**
 * Files worth trying that nothing refers to: the README, and a font licence
 * next to each font file.
 * @param {string[]} files  Referenced files.
 * @param {string[]} families  Font families declared with @font-face.
 * @returns {string[]}
 */
export function optionalFiles(files, families) {
  const out = ['README.md'];
  const dirs = [...new Set(files.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f)).map((f) => f.split('/').slice(0, -1).join('/')))];
  for (const dir of dirs) {
    const prefix = dir ? `${dir}/` : '';
    for (const name of ['OFL.txt', ...families.map((f) => `${f.replace(/\s+/g, '')}-OFL.txt`)]) {
      if (!out.includes(prefix + name)) out.push(prefix + name);
    }
  }
  return out.filter((f) => !files.includes(f));
}

/**
 * Does the template draw 4:3 slides (a `[data-aspect="4:3"]` rule in its theme)?
 * @param {string} themeCss
 */
export function supportsFourThree(themeCss) {
  return /data-aspect=["']?4:3/.test(themeCss);
}

/**
 * A template id from a name: lower case, digits and single hyphens.
 * @param {string} name
 */
export function idFromName(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * A family name from a font file name: "inter-variable-latin.woff2" → "Inter",
 * "SourceSerif4-Regular.ttf" → "SourceSerif4".
 * @param {string} name
 */
export function familyFromFileName(name) {
  const words = name.replace(/\.[^.]+$/, '').split(/[-_ ]+/)
    .filter((w) => !/^(var|variable|vf|latin|ext|regular|italic|bold|normal|opsz|wght|\d+)$/i.test(w));
  return cleanFamily(words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) || 'Brand';
}

/**
 * Is this a valid template id (the schema's pattern)?
 * @param {string} id
 */
export function isTemplateId(id) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/**
 * The template.json of a clone: new id, name and description, version 0.1.0.
 * Key order stays as in the original.
 * @param {any} template
 * @param {{ id: string, name: string, date: string }} clone
 * @returns {any}
 */
export function cloneTemplateJson(template, clone) {
  return {
    ...template,
    id: clone.id,
    name: clone.name,
    version: '0.1.0',
    description: `Based on the template "${template.name}" (${template.id} ${template.version}), ${clone.date}.`,
  };
}

/**
 * A README for a clone: the original's README describes the original.
 * @param {any} clone  The clone's template.json.
 * @param {any} source The original's template.json.
 * @param {string} date
 * @returns {string}
 */
export function cloneReadme(clone, source, date) {
  const rows = (clone.layouts ?? []).map((/** @type {any} */ l) => `| \`${l.id}\` | ${l.name ?? ''} | ${(l.slots ?? []).map((/** @type {any} */ s) => s.name).join(', ')} |`);
  return [
    `# ${clone.name}`,
    '',
    `A Slipr template, made on ${date} with the template editor from "${source.name}" (\`${source.id}\` ${source.version}).`,
    '',
    'To use it in shows, keep this folder in Slipr\'s `templates/` folder and add its id to `templates/index.json`.',
    '',
    '## Layouts',
    '',
    '| Layout | Name | Slots |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

/**
 * Link each style guide colour to the token that defines it: by name
 * (`--slipr-color-<name>`, `background` → `--slipr-color-bg`, any `--<prefix>-<name>`),
 * otherwise by value (the only token whose own value is that colour).
 * @param {any} template
 * @param {Array<{ name: string, value: string }>} catalog
 * @returns {Map<string, string>}  style guide colour name → token name
 */
export function styleguideLinks(template, catalog) {
  /** @type {Map<string, string>} */
  const links = new Map();
  const colors = template?.styleguide?.colors ?? {};
  const names = new Set(catalog.map((t) => t.name));
  for (const [key, hex] of Object.entries(colors)) {
    const alias = key === 'background' ? 'bg' : key;
    const byName = [`--slipr-color-${alias}`, ...catalog.map((t) => t.name).filter((n) => !n.startsWith('--slipr-') && n.replace(/^--[a-z0-9]+-/, '') === alias)]
      .find((n) => names.has(n));
    if (byName) {
      links.set(key, byName);
      continue;
    }
    const target = parseColor(String(hex));
    if (!target) continue;
    const same = catalog.filter((t) => {
      const c = parseColor(t.value);
      return c && toHex(c) === toHex(target);
    });
    if (same.length === 1) links.set(key, same[0].name);
  }
  return links;
}

/**
 * The template with each linked style guide colour set to its token's colour.
 * Returns the same object when nothing changes.
 * @param {any} template
 * @param {Map<string, string>} links
 * @param {Array<{ name: string, resolved: string | null }>} catalog
 * @returns {any}
 */
export function syncStyleguide(template, links, catalog) {
  const colors = template?.styleguide?.colors;
  if (!colors) return template;
  const next = { ...colors };
  let changed = false;
  for (const [key, tokenName] of links) {
    const token = catalog.find((t) => t.name === tokenName);
    const c = token?.resolved ? parseColor(token.resolved) : null;
    if (!c || c.a !== 1 || !(key in next)) continue;
    const hex = toHex(c);
    const old = parseColor(String(next[key]));
    if (old && toHex(old) === hex) continue;
    next[key] = hex;
    changed = true;
  }
  return changed ? { ...template, styleguide: { ...template.styleguide, colors: next } } : template;
}
