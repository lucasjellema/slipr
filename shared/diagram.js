// @ts-check
/**
 * Shared Mermaid diagram renderer (I-073).
 *
 * Used by viewer audience mode, reader mode, and the editor preview.
 * Lazy-loads the vendored Mermaid library (D-002) only when a diagram is present.
 * Caches rendered SVGs by diagram source text for speed and low memory usage.
 */

/** @type {Promise<any> | null} */
let mermaidPromise = null;
/** @type {Map<string, string>} */
const svgCache = new Map();
let nextDiagramId = 0;

/**
 * Lazy-load and initialize vendored Mermaid once.
 * Configured with strict security and neutral theme variables.
 */
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const vendorUrl = new URL('../vendor/mermaid-11.4.1/dist/mermaid.esm.min.mjs', import.meta.url).href;
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
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
        },
        sequence: {
          useMaxWidth: true,
        },
      });
      return mermaid;
    })();
  }
  return mermaidPromise;
}

/**
 * Check whether a value is a diagram slot/block object.
 * @param {any} value
 * @returns {boolean}
 */
export function isDiagram(value) {
  return Boolean(value && typeof value === 'object' && typeof value.mermaid === 'string');
}

/**
 * Render a single Mermaid diagram container element.
 * @param {HTMLElement} el  Element with class .slipr-diagram
 */
export async function renderDiagramElement(el) {
  if (el.dataset.rendered === 'true') return;
  const rawCode = el.dataset.mermaid || el.querySelector('.mermaid')?.textContent || el.textContent || '';
  const code = rawCode.trim();
  if (!code) return;

  if (svgCache.has(code)) {
    el.innerHTML = /** @type {string} */ (svgCache.get(code));
    el.dataset.rendered = 'true';
    return;
  }

  try {
    const mermaid = await getMermaid();
    const id = `slipr-mmd-${Date.now()}-${++nextDiagramId}`;
    const { svg } = await mermaid.render(id, code);
    svgCache.set(code, svg);
    el.innerHTML = svg;
    el.dataset.rendered = 'true';
  } catch (err) {
    console.warn('Slipr: Mermaid diagram render error:', err);
    el.dataset.rendered = 'error';
    const msg = err instanceof Error ? err.message : String(err);
    el.innerHTML = `<div class="slipr-diagram-error"><span class="slipr-diagram-error-badge">Diagram syntax error</span><pre class="slipr-diagram-error-text">${escapeHtml(msg)}</pre></div>`;
  }
}

/**
 * Find and render all unrendered .slipr-diagram elements within root.
 * Safe to call in any environment; no-op if no root or DOM available.
 * @param {ParentNode | null} [root]
 */
export async function renderDiagrams(root) {
  const target = root ?? (typeof document !== 'undefined' ? document : null);
  if (!target || typeof target.querySelectorAll !== 'function') return;

  const elements = /** @type {NodeListOf<HTMLElement>} */ (target.querySelectorAll('.slipr-diagram:not([data-rendered="true"])'));
  if (elements.length === 0) return;
  await Promise.all(Array.from(elements).map(renderDiagramElement));
}

/**
 * Clear the rendered SVG cache (for tests or reload).
 */
export function clearDiagramCache() {
  svgCache.clear();
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
