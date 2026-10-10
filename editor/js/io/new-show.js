// @ts-check
/**
 * Build the show.json for a new show from a template (E-002). DOM-free.
 * New shows reference their template root-relative, "/templates/<id>" (D-012).
 */
import { generateId } from '../actions.js';

/**
 * Turn a title into a kebab-case show id.
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Semver range a new show asks of its template: "^major.minor".
 * @param {string | undefined} version  e.g. "1.0.0"
 * @returns {string | undefined}
 */
export function caretRange(version) {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '');
  return m ? `^${m[1]}.${m[2]}` : undefined;
}

/**
 * @param {{ templateId: string, template: any, title: string, date?: string, language?: string }} options
 * @returns {any}
 */
export function buildNewShow({ templateId, template, title, date, language = 'en' }) {
  const cleanTitle = title.trim() || 'Untitled show';
  const firstLayout = template?.layouts?.[0];
  const hasTitleSlot = firstLayout?.slots?.some((/** @type {any} */ s) => s.name === 'title' && s.type === 'text');
  const version = caretRange(template?.version);

  return {
    slipr: '0.1',
    id: slugify(cleanTitle) || 'show',
    meta: { title: cleanTitle, ...(date ? { date } : {}), language },
    template: { ref: `/templates/${templateId}`, ...(version ? { version } : {}) },
    slides: [
      {
        id: generateId('s-'),
        layout: firstLayout?.id ?? 'title',
        content: hasTitleSlot ? { title: cleanTitle } : {},
      },
    ],
  };
}
