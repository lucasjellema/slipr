// @ts-check
/**
 * The editor side of the preview iframe (I-106): turns the open template into
 * what `preview.html` draws. Template files become `blob:` URLs (so a template
 * opened from a folder, or a font just added, shows without being saved), and
 * the stylesheet text is swapped on every token change.
 */
import { rewriteCssUrls, rewriteHtmlUrls } from '../css-tokens.js';
import { joinPath, sheetPaths } from '../template-files.js';
import { mimeType } from '../../../shared/zip.js';

/** @typedef {import('../actions.js').TemplateState} TemplateState */

/**
 * @param {HTMLIFrameElement} frame
 */
export function createPreview(frame) {
  /** @type {Map<string, { content: unknown, url: string }>} */
  const urls = new Map();
  /** @type {Promise<any>} */
  const ready = new Promise((resolve) => {
    const check = () => {
      const api = /** @type {any} */ (frame.contentWindow)?.sliprPreview;
      if (api) resolve(api);
      return Boolean(api);
    };
    if (!check()) {
      frame.addEventListener('load', () => {
        if (!check()) frame.contentWindow?.addEventListener('slipr-preview-ready', () => check(), { once: true });
      });
    }
  });

  /**
   * A blob: URL for a template file (made again when the file changes).
   * @param {TemplateState} state @param {string | null} path
   * @returns {string}
   */
  const assetUrl = (state, path) => {
    if (!path) return 'about:blank';
    const content = path === 'template.json' ? null : state.files.get(path);
    if (content === undefined || content === null) return 'about:blank';
    const cached = urls.get(path);
    if (cached && cached.content === content) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType(path) }) : content;
    const url = URL.createObjectURL(blob);
    urls.set(path, { content, url });
    return url;
  };

  /**
   * The template's stylesheets with their URLs pointing at blob: URLs.
   * @param {TemplateState} state
   */
  const sheets = (state) => {
    const paths = sheetPaths(state.template);
    const text = (/** @type {string | null} */ path) => {
      const v = path ? state.files.get(path) : null;
      return typeof v === 'string' ? rewriteCssUrls(v, (ref) => assetUrl(state, joinPath(/** @type {string} */ (path), ref))) : '';
    };
    return { theme: text(paths.theme), reader: text(paths.reader) };
  };

  return {
    /**
     * Swap the stylesheets (token changes).
     * @param {TemplateState} state
     */
    async setStyles(state) {
      const api = await ready;
      const { theme, reader } = sheets(state);
      api.setStyles(theme, reader);
    },

    /**
     * Draw a sample show.
     * @param {TemplateState} state
     * @param {{ show: any, showUrl: string, mode: 'audience' | 'reader', stage?: boolean }} sample
     */
    async render(state, sample) {
      const api = await ready;
      const { theme, reader } = sheets(state);
      api.setStyles(theme, reader);
      const layouts = (state.template.layouts ?? [])
        .filter((/** @type {any} */ def) => typeof state.files.get(def.file) === 'string')
        .map((/** @type {any} */ def) => ({
          id: def.id,
          def,
          html: rewriteHtmlUrls(/** @type {string} */ (state.files.get(def.file)), (ref) => assetUrl(state, joinPath(def.file, ref))),
        }));
      await api.render({ template: state.template, layouts, show: sample.show, showUrl: sample.showUrl, mode: sample.mode, stage: Boolean(sample.stage) });
    },

    /**
     * Where the staged slide's canvas is, in the editor's coordinates (I-111).
     * @returns {DOMRect | null}
     */
    canvasRect() {
      const api = /** @type {any} */ (frame.contentWindow)?.sliprPreview;
      const r = api?.canvasRect();
      if (!r) return null;
      const f = frame.getBoundingClientRect();
      return new DOMRect(f.left + r.left, f.top + r.top, r.width, r.height);
    },

    /** Free every blob: URL (when the template is closed). */
    clear() {
      for (const { url } of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
