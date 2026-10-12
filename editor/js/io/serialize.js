// @ts-check
/**
 * show.json as the editor writes it: 2-space indentation, a trailing newline,
 * and a stable key order, so git diffs stay clean. The key order is the order
 * of `properties` in the JSON Schema (shared/schema/show.schema.json), so it
 * follows the spec. Unknown keys keep their order after the known ones. Slot
 * names in `content` keep the show's order. The converter writes the same
 * indentation (json.dumps, indent=2). DOM-free.
 */
import showSchema from '../../../shared/schema/show.schema.json' with { type: 'json' };

const defs = /** @type {Record<string, any>} */ (showSchema.$defs);

/**
 * @typedef {object} Shape
 * @property {string[]} [keys]                  Known keys, in order.
 * @property {Record<string, ShapeRef>} [fields] Shape per known key.
 * @property {ShapeRef} [values]                 Shape for any other value (maps, unknown keys).
 * @property {ShapeRef} [items]                  Shape for array items.
 */
/** @typedef {Shape | ((value: any) => Shape)} ShapeRef */

/** @param {any} node @returns {string[]} */
const keysOf = (node) => Object.keys(node?.properties ?? {});

const image = { keys: keysOf(defs.image) };

/** A slot value: shape by what it holds (docs/show-format.md, "Slot value types"). */
const slotValue = /** @type {(value: any) => Shape} */ ((value) => {
  if (Array.isArray(value)) return { items: { values: slotValue } };
  if (value === null || typeof value !== 'object') return {};
  if ('src' in value) return image;
  if ('code' in value) return { keys: keysOf(defs.code) };
  if ('mermaid' in value) return { keys: keysOf(defs.diagram), fields: { fallback: image } };
  if ('url' in value) return { keys: keysOf(defs.web), fields: { fallback: image } };
  if ('pdf' in value) return { keys: keysOf(defs.pdf), fields: { fallback: image } };
  if ('kind' in value) return { keys: keysOf(defs.chart) };
  if ('text' in value) return { keys: keysOf(defs.quote) };
  return {};
});

/** A reader block: shape by its `type` (`slide-ref` → `blockSlideRef`). */
const block = /** @type {(value: any) => Shape} */ ((value) => {
  const name = 'block' + String(value?.type ?? '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const def = defs[name];
  return {
    keys: keysOf(def),
    fields: {
      image,
      fallback: image,
      tabs: { items: { keys: keysOf(def?.properties?.tabs?.items) } },
      hotspots: { items: { keys: keysOf(def?.properties?.hotspots?.items) } },
    },
  };
});

/** @type {Shape} */
const slide = {
  keys: keysOf(defs.slide),
  fields: {
    content: { values: slotValue },
    overlays: { items: { keys: keysOf(defs.overlay), fields: { image } } },
    _orphaned: { values: slotValue },
    audience: { keys: keysOf(defs.audience) },
    reader: { keys: keysOf(defs.reader), fields: { blocks: { items: block } } },
  },
};

/** @type {Shape} */
const root = {
  keys: keysOf(showSchema),
  fields: {
    meta: { keys: keysOf(defs.meta) },
    template: { keys: keysOf(defs.templateRef) },
    settings: { keys: keysOf(defs.settings) },
    chapters: { items: { keys: keysOf(defs.chapter) } },
    glossary: { values: { keys: keysOf(defs.glossaryTerm) } },
    profiles: { items: { keys: keysOf(defs.profile) } },
    paths: { items: { keys: keysOf(defs.path) } },
    slides: { items: slide },
  },
};

/**
 * Copy of a value with keys in canonical order.
 * @param {any} value
 * @param {ShapeRef | undefined} shapeRef
 * @returns {any}
 */
function ordered(value, shapeRef) {
  const shape = typeof shapeRef === 'function' ? shapeRef(value) : shapeRef ?? {};
  if (Array.isArray(value)) return value.map((item) => ordered(item, shape.items));
  if (value === null || typeof value !== 'object') return value;
  const known = (shape.keys ?? []).filter((k) => k in value);
  const rest = Object.keys(value).filter((k) => !known.includes(k));
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of [...known, ...rest]) {
    out[key] = ordered(value[key], shape.fields?.[key] ?? shape.values);
  }
  return out;
}

/**
 * The show with keys in canonical order (same data).
 * @param {any} show
 * @returns {any}
 */
export function canonicalShow(show) {
  return ordered(show, root);
}

/**
 * The text of show.json as the editor saves it.
 * @param {any} show
 * @returns {string}
 */
export function serializeShow(show) {
  return JSON.stringify(canonicalShow(show), null, 2) + '\n';
}
