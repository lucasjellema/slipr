// @ts-check
/**
 * Embed kind `diagram`: Mermaid diagrams (I-073), as a `diagram` slot and a
 * `diagram` reader block. Follows the embed kind contract of ./index.js.
 *
 * The vendored Mermaid (D-002) is imported only when the first diagram is
 * hydrated, and rendered SVGs are cached by source text.
 */
import { escape } from '../markdown.js';

/** Vendor folder (relative to the Slipr root); the export leaves it out of shows without diagrams. */
export const library = 'vendor/mermaid-11.4.1/';
/** Rendered in editor thumbnails too (local and cheap once loaded). */
export const thumbnail = true;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Diagram syntax error';

/** @type {Promise<any> | null} */
let mermaidPromise = null;
/** @type {Map<string, string>} */
const svgCache = new Map();
let nextDiagramId = 0;

/**
 * Is this a diagram value (slot value or block)?
 * @param {any} value
 * @returns {boolean}
 */
export function isDiagram(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.mermaid === 'string');
}

/**
 * Attributes of the embed element. `slipr-diagram` keeps the templates' styling hook.
 * @param {any} value
 * @returns {Record<string, string>}
 */
export function attributes(value) {
  return { class: 'slipr-diagram', 'data-mermaid': String(value?.mermaid ?? '') };
}

/**
 * Static content without a fallback image: the Mermaid source.
 * @param {any} value
 * @returns {{ html: string, fallback: 'source' }}
 */
export function staticHtml(value) {
  return { html: `<pre class="mermaid">${escape(String(value?.mermaid ?? ''))}</pre>`, fallback: 'source' };
}

/**
 * Render the diagram into `live`. Throws on a syntax error.
 * @param {HTMLElement} el  The embed element (carries data-mermaid).
 * @param {HTMLElement} live  Where the rendered content goes.
 */
export async function hydrate(el, live) {
  const code = (el.dataset.mermaid ?? '').trim();
  if (!code) throw new Error('The diagram is empty.');
  let svg = svgCache.get(code);
  if (svg === undefined) {
    const mermaid = await getMermaid();
    ({ svg } = await mermaid.render(`slipr-mmd-${Date.now()}-${++nextDiagramId}`, code));
    svgCache.set(code, /** @type {string} */ (svg));
  }
  live.innerHTML = /** @type {string} */ (svg); // Mermaid output, strict security level
}

/** Clear the rendered SVG cache (for tests or reload). */
export function clearDiagramCache() {
  svgCache.clear();
}

/**
 * Lazy-load and initialise the vendored Mermaid once: strict security, the
 * neutral theme with the template's body font.
 */
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const vendorUrl = new URL('../../vendor/mermaid-11.4.1/dist/mermaid.esm.min.mjs', import.meta.url).href;
      const mod = await import(vendorUrl);
      const mermaid = mod.default || mod;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        themeVariables: {
          fontFamily: 'var(--slipr-font-body, system-ui, -apple-system, sans-serif)',
          primaryColor: '#f4f6f9',
          primaryTextColor: '#1e2329',
          primaryBorderColor: '#1f3a5f',
          lineColor: '#5b6573',
          secondaryColor: '#ffffff',
          tertiaryColor: '#f4f6f9',
        },
        flowchart: { htmlLabels: false, useMaxWidth: true },
        sequence: { useMaxWidth: true },
      });
      return mermaid;
    })();
    mermaidPromise.catch(() => { mermaidPromise = null; }); // a failed load may be retried
  }
  return mermaidPromise;
}
