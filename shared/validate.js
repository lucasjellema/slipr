// @ts-check
/**
 * Validation of Slipr shows and templates.
 *
 * Two layers:
 *  1. Structure: the JSON Schemas in ./schema/ (single source of truth, also
 *     used by VS Code and the Python converter), checked by schema-check.js.
 *  2. Semantics: things a schema cannot express, such as unique ids, references
 *     between slides, glossary and profiles, and slot types defined by the
 *     template.
 *
 * Never throws on bad input; always returns { ok, errors, warnings }.
 * Errors mean "cannot render", warnings mean "renders, but something is off".
 * See docs/show-format.md → Validation rules.
 */
import { checkSchema } from './schema-check.js';
import { foldText } from './glossary.js';
import { pdfEntries } from './embeds/pdf.js';
import showSchema from './schema/show.schema.json' with { type: 'json' };
import templateSchema from './schema/template.schema.json' with { type: 'json' };

/** @typedef {import('./schema-check.js').Issue} Issue */
/** @typedef {{ ok: boolean, errors: Issue[], warnings: Issue[] }} ValidationResult */

/**
 * @typedef {object} ValidateShowOptions
 * @property {any} [template] Parsed template.json. Enables layout and slot checks.
 * @property {(src: string) => boolean} [imageExists] Optional check for image files
 *   (src relative to show.json). Missing files produce a warning.
 */

const GLOSSARY_REF = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
const SLIDE_LINK = /\]\(#([^)\s/]+)(?:\/[^)\s]*)?\)/g;

/**
 * Validate a parsed show.json.
 * @param {any} show
 * @param {ValidateShowOptions} [options]
 * @returns {ValidationResult}
 */
export function validateShow(show, options = {}) {
  const errors = checkSchema(show, showSchema);
  /** @type {Issue[]} */
  const warnings = [];
  if (!isObject(show)) return result(errors, warnings);

  const slides = arrayOf(show.slides);
  const slideIds = new Set();
  const glossaryIds = new Set(isObject(show.glossary) ? Object.keys(show.glossary) : []);
  checkGlossaryNames(show, errors, warnings);
  const profileIds = collectIds(show.profiles, 'profiles', errors);
  const chapterIds = collectIds(show.chapters, 'chapters', errors);
  collectIds(show.paths, 'paths', errors);

  slides.forEach((slide, i) => {
    if (!isObject(slide) || typeof slide.id !== 'string') return;
    if (slideIds.has(slide.id)) {
      errors.push({ path: `slides[${i}].id`, code: 'duplicate-id', message: `duplicate slide id "${slide.id}"` });
    }
    slideIds.add(slide.id);
  });

  const layouts = templateLayouts(options.template);

  slides.forEach((slide, i) => {
    if (!isObject(slide)) return;
    const at = `slides[${i}]`;

    if (slide.chapter !== undefined && !chapterIds.has(slide.chapter)) {
      warnings.push({ path: `${at}.chapter`, code: 'unknown-chapter', message: `unknown chapter "${slide.chapter}"` });
    }
    if (layouts) checkSlots(slide, at, layouts, errors, warnings);
    checkImages(slide, at, options.imageExists, errors, warnings, options.template, show.slipr);
    checkOverlays(slide, at, show.slipr, errors, warnings);
    checkEmbeds(slide, at, show.slipr, errors, warnings, options.imageExists);

    const reader = isObject(slide.reader) ? slide.reader : {};
    const blockIds = new Set();
    arrayOf(reader.blocks).forEach((block, j) => {
      if (!isObject(block)) return;
      const bat = `${at}.reader.blocks[${j}]`;
      if (typeof block.id === 'string') {
        if (blockIds.has(block.id)) {
          errors.push({ path: `${bat}.id`, code: 'duplicate-id', message: `duplicate block id "${block.id}" in slide "${slide.id}"` });
        }
        blockIds.add(block.id);
      }
      arrayOf(block.for).forEach((profile, k) => {
        if (!profileIds.has(profile)) {
          warnings.push({ path: `${bat}.for[${k}]`, code: 'unknown-profile', message: `unknown profile "${profile}"` });
        }
      });
      if (block.type === 'slide-ref' && typeof block.slide === 'string' && !slideIds.has(block.slide)) {
        warnings.push({ path: `${bat}.slide`, code: 'unknown-slide', message: `unknown slide "${block.slide}"` });
      }
    });
    arrayOf(reader.related).forEach((id, k) => {
      if (!slideIds.has(id)) {
        warnings.push({ path: `${at}.reader.related[${k}]`, code: 'unknown-slide', message: `unknown slide "${id}"` });
      }
    });
  });

  arrayOf(show.paths).forEach((path, i) => {
    if (!isObject(path)) return;
    arrayOf(path.slides).forEach((id, k) => {
      if (!slideIds.has(id)) {
        warnings.push({ path: `paths[${i}].slides[${k}]`, code: 'unknown-slide', message: `unknown slide "${id}"` });
      }
    });
  });

  forEachMarkdown(show, (text, path) => {
    for (const [, id] of text.matchAll(GLOSSARY_REF)) {
      if (!glossaryIds.has(id.trim())) {
        warnings.push({ path, code: 'unknown-glossary', message: `unknown glossary term "[[${id}]]"` });
      }
    }
    for (const [, id] of text.matchAll(SLIDE_LINK)) {
      if (!slideIds.has(id)) {
        warnings.push({ path, code: 'unknown-slide', message: `link to unknown slide "#${id}"` });
      }
    }
  });

  const range = show.template?.version;
  const version = options.template?.version;
  if (typeof range === 'string' && typeof version === 'string' && !satisfies(version, range)) {
    warnings.push({ path: 'template.version', code: 'template-version', message: `template version ${version} is outside the range "${range}" this show was made for` });
  }

  // A slot value of the wrong kind is caught twice: vaguely by the schema
  // ("unsupported form") and precisely by the template check. Keep the precise one.
  const slotTypePaths = new Set(errors.filter((e) => e.code === 'slot-type').map((e) => e.path));
  return result(errors.filter((e) => !(e.code === 'anyOf' && slotTypePaths.has(e.path))), warnings);
}

/**
 * Validate a parsed template.json.
 * @param {any} template
 * @returns {ValidationResult}
 */
export function validateTemplate(template) {
  const errors = checkSchema(template, templateSchema);
  /** @type {Issue[]} */
  const warnings = [];
  if (!isObject(template)) return result(errors, warnings);

  const layoutIds = collectIds(template.layouts, 'layouts', errors);
  // Picture styles (D-014, I-084): template format 0.3, unique ids.
  if (template.pictureStyles !== undefined) {
    if (template.slipr === '0.1' || template.slipr === '0.2') {
      errors.push({ path: 'pictureStyles', code: 'format-version', message: 'picture styles need template format 0.3: set "slipr" to "0.3"' });
    }
    collectIds(template.pictureStyles, 'pictureStyles', errors);
  }
  arrayOf(template.layouts).forEach((layout, i) => {
    if (!isObject(layout)) return;
    const names = new Set();
    arrayOf(layout.slots).forEach((slot, j) => {
      if (!isObject(slot)) return;
      if (names.has(slot.name)) {
        errors.push({ path: `layouts[${i}].slots[${j}].name`, code: 'duplicate-id', message: `duplicate slot "${slot.name}" in layout "${layout.id}"` });
      }
      names.add(slot.name);
    });
  });
  if (isObject(template.pptxMapping)) {
    const layoutsById = new Map(arrayOf(template.layouts).filter(isObject).map((l) => [l.id, l]));
    for (const [pptxName, target] of Object.entries(template.pptxMapping)) {
      const path = `pptxMapping[${JSON.stringify(pptxName)}]`;
      const layoutId = typeof target === 'string' ? target : target?.layout;
      if (!layoutIds.has(layoutId)) {
        warnings.push({ path, code: 'unknown-layout', message: `maps to unknown layout "${layoutId}"` });
        continue;
      }
      // 0.2: placeholder roles must name slots of the target layout:
      // "slot", or for cards slots "slot[i]" / "slot[i].field".
      const slots = new Map(arrayOf(layoutsById.get(layoutId)?.slots).map((s) => [s?.name, s]));
      for (const [idx, role] of Object.entries(isObject(target?.placeholders) ? target.placeholders : {})) {
        if (role === null) continue;
        const where = `${path}.placeholders["${idx}"]`;
        const m = /^([A-Za-z0-9][A-Za-z0-9_-]*)(?:\[(\d+)\](?:\.([A-Za-z0-9][A-Za-z0-9_-]*))?)?$/.exec(String(role));
        const slot = m ? slots.get(m[1]) : undefined;
        if (!slot) {
          warnings.push({ path: where, code: 'unknown-slot', message: `layout "${layoutId}" has no slot "${m ? m[1] : role}"` });
        } else if (m?.[2] !== undefined && slot.type !== 'cards') {
          warnings.push({ path: where, code: 'unknown-slot', message: `"${role}": slot "${m[1]}" is not a cards slot` });
        } else if (m?.[3] && !arrayOf(slot.fields).some((f) => f?.name === m[3])) {
          warnings.push({ path: where, code: 'unknown-field', message: `cards in slot "${m[1]}" have no field "${m[3]}"` });
        } else if (slot.maxItems && m?.[2] !== undefined && Number(m[2]) >= slot.maxItems) {
          warnings.push({ path: where, code: 'too-many-items', message: `"${role}" is beyond the slot's ${slot.maxItems} cards` });
        }
      }
    }
  }
  return result(errors, warnings);
}

/**
 * Collect every image src used by a show (slots, image blocks, extra images,
 * embed fallbacks) and every PDF in the show folder (I-072), e.g. to check that
 * the files exist, embed them in an export, or open them from a folder.
 * @param {any} show
 * @returns {string[]}
 */
export function collectImagePaths(show) {
  /** @type {string[]} */
  const found = [];
  for (const slide of arrayOf(show?.slides)) {
    for (const value of Object.values(isObject(slide?.content) ? slide.content : {})) {
      if (isImage(value)) found.push(value.src);
      if (Array.isArray(value)) {
        for (const card of value) for (const v of Object.values(isObject(card) ? card : {})) if (isImage(v)) found.push(v.src);
      }
    }
    for (const block of arrayOf(slide?.reader?.blocks)) {
      if (block?.type === 'image' && isImage(block.image)) found.push(block.image.src);
    }
    for (const overlay of arrayOf(slide?.overlays)) {
      if (isImage(overlay?.image)) found.push(overlay.image.src);
    }
    for (const [image] of embedFallbacks(slide, '')) found.push(image.src);
    // PDF files in the show folder (I-072): checked, embedded and opened like images.
    for (const { value } of pdfEntries({ slides: [slide] })) {
      if (!/^[a-z][a-z0-9+.-]*:/i.test(value.pdf)) found.push(value.pdf);
    }
  }
  return [...new Set(found)];
}

/**
 * Minimal semver range check: "*", "1.2.3", "^1.2", "~1.2.3", ">=1.2".
 * Unknown range syntax is treated as satisfied (no false alarms).
 * @param {string} version
 * @param {string} range
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  const r = range.trim();
  if (!v || r === '*' || r === '') return true;
  const m = /^(\^|~|>=)?\s*(\d+(?:\.\d+){0,2})$/.exec(r);
  if (!m) return true;
  const [op, base] = [m[1] ?? '', m[2]];
  const b = /** @type {number[]} */ (parseVersion(base));
  const parts = base.split('.').length;
  const cmp = compare(v, b);
  if (op === '>=') return cmp >= 0;
  if (op === '^') return cmp >= 0 && (b[0] > 0 ? v[0] === b[0] : v[0] === 0 && v[1] === b[1]);
  if (op === '~') return cmp >= 0 && v[0] === b[0] && (parts < 2 || v[1] === b[1]);
  // exact (missing parts act as wildcards: "1.2" matches 1.2.x)
  return v.slice(0, parts).every((n, i) => n === b[i]);
}

// ---------------------------------------------------------------------------

/**
 * @param {any} slide @param {string} at
 * @param {Map<string, any>} layouts
 * @param {Issue[]} errors @param {Issue[]} warnings
 */
function checkSlots(slide, at, layouts, errors, warnings) {
  const layout = layouts.get(slide.layout);
  if (!layout) {
    if (typeof slide.layout === 'string') {
      errors.push({ path: `${at}.layout`, code: 'unknown-layout', message: `unknown layout "${slide.layout}"; the template has: ${[...layouts.keys()].join(', ')}` });
    }
    return;
  }
  const content = isObject(slide.content) ? slide.content : {};
  const slots = new Map(arrayOf(layout.slots).map((s) => [s.name, s]));

  for (const [name, value] of Object.entries(content)) {
    const slot = slots.get(name);
    const path = `${at}.content.${name}`;
    if (!slot) {
      warnings.push({ path, code: 'unknown-slot', message: `layout "${layout.id}" has no slot "${name}" (ignored)` });
      continue;
    }
    if (!matchesSlotType(value, slot.type)) {
      errors.push({ path, code: 'slot-type', message: `slot "${name}" expects ${slotTypeLabel(slot.type)}` });
      continue;
    }
    if (slot.maxLength && typeof value === 'string' && value.length > slot.maxLength) {
      warnings.push({ path, code: 'too-long', message: `is ${value.length} characters; the layout is designed for at most ${slot.maxLength}` });
    }
    if (slot.maxItems && (slot.type === 'list' || slot.type === 'cards')) {
      const count = Array.isArray(value) ? value.length : value.split('\n').filter((l) => /^[-*] /.test(l)).length;
      if (count > slot.maxItems) {
        warnings.push({ path, code: 'too-many-items', message: `has ${count} items; the layout is designed for at most ${slot.maxItems}` });
      }
    }
    if (slot.type === 'cards') checkCards(value, slot, path, errors, warnings);
  }
  for (const slot of slots.values()) {
    if (slot.required && isEmpty(content[slot.name])) {
      warnings.push({ path: `${at}.content`, code: 'missing-slot', message: `required slot "${slot.name}" of layout "${layout.id}" is empty` });
    }
  }
}

/**
 * Cards: each card's fields must exist in the slot definition and have the
 * right type; required fields and maxLength are checked per card.
 * @param {any[]} cards @param {any} slot @param {string} path
 * @param {Issue[]} errors @param {Issue[]} warnings
 */
function checkCards(cards, slot, path, errors, warnings) {
  const fields = new Map(arrayOf(slot.fields).map((f) => [f.name, f]));
  cards.forEach((card, i) => {
    const at = `${path}[${i}]`;
    for (const [name, value] of Object.entries(card)) {
      const field = fields.get(name);
      if (!field) {
        warnings.push({ path: `${at}.${name}`, code: 'unknown-field', message: `cards in slot "${slot.name}" have no field "${name}" (ignored)` });
        continue;
      }
      if (!matchesSlotType(value, field.type)) {
        errors.push({ path: `${at}.${name}`, code: 'slot-type', message: `card field "${name}" expects ${slotTypeLabel(field.type)}` });
        continue;
      }
      if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
        warnings.push({ path: `${at}.${name}`, code: 'too-long', message: `is ${value.length} characters; the card is designed for at most ${field.maxLength}` });
      }
    }
    for (const field of fields.values()) {
      if (field.required && isEmpty(card[field.name])) {
        warnings.push({ path: at, code: 'missing-field', message: `card ${i + 1}: required field "${field.name}" is empty` });
      }
    }
  });
}

/**
 * The ids of a template's picture styles, or null without a template (then
 * styles are not checked).
 * @param {any} template
 * @returns {Set<string> | null}
 */
export function pictureStyleIds(template) {
  if (!isObject(template)) return null;
  return new Set(arrayOf(template.pictureStyles).filter(isObject).map((s) => s.id));
}

/**
 * @param {any} slide @param {string} at
 * @param {((src: string) => boolean) | undefined} imageExists
 * @param {Issue[]} errors @param {Issue[]} warnings
 * @param {any} template @param {unknown} version
 */
function checkImages(slide, at, imageExists, errors, warnings, template, version) {
  /** @type {[any, string][]} */
  const images = [];
  for (const [name, value] of Object.entries(isObject(slide.content) ? slide.content : {})) {
    if (isImage(value)) images.push([value, `${at}.content.${name}`]);
    if (Array.isArray(value)) {
      value.forEach((card, i) => {
        for (const [field, v] of Object.entries(isObject(card) ? card : {})) {
          if (isImage(v)) images.push([v, `${at}.content.${name}[${i}].${field}`]);
        }
      });
    }
  }
  arrayOf(slide.reader?.blocks).forEach((block, j) => {
    if (block?.type === 'image' && isImage(block.image)) images.push([block.image, `${at}.reader.blocks[${j}].image`]);
  });
  arrayOf(slide.overlays).forEach((overlay, j) => {
    if (isImage(overlay?.image)) images.push([overlay.image, `${at}.overlays[${j}].image`]);
  });
  images.push(...embedFallbacks(slide, at));
  const styles = pictureStyleIds(template);
  for (const [image, path] of images) {
    // Picture style and opacity (D-014, I-084): show format 0.2; unknown styles render unstyled.
    if ((image.style !== undefined || image.opacity !== undefined) && version === '0.1') {
      errors.push({ path, code: 'format-version', message: 'a picture style or opacity needs show format 0.2: set "slipr" to "0.2"' });
    }
    if (styles && typeof image.style === 'string' && !styles.has(image.style)) {
      warnings.push({ path, code: 'unknown-picture-style', message: `the template has no picture style "${image.style}"; the picture is shown without it` });
    }
    if (!image.alt || !String(image.alt).trim()) {
      warnings.push({ path, code: 'missing-alt', message: `image "${image.src}" has no alt text` });
    }
    if (imageExists && !imageExists(image.src)) {
      warnings.push({ path, code: 'missing-file', message: `image file "${image.src}" not found` });
    }
  }
}

/**
 * Glossary aliases (I-086): show format 0.2; a name (term or alias) used by
 * two terms is a warning, because slides link it to the first one only.
 * @param {any} show @param {Issue[]} errors @param {Issue[]} warnings
 */
function checkGlossaryNames(show, errors, warnings) {
  if (!isObject(show.glossary)) return;
  /** @type {Map<string, string>} */
  const owner = new Map();
  for (const [id, entry] of Object.entries(show.glossary)) {
    if (!isObject(entry)) continue;
    if (entry.aliases !== undefined && show.slipr === '0.1') {
      errors.push({ path: `glossary.${id}.aliases`, code: 'format-version', message: 'glossary aliases need show format 0.2: set "slipr" to "0.2"' });
    }
    for (const name of [entry.term, ...arrayOf(entry.aliases)]) {
      if (typeof name !== 'string') continue;
      const key = foldText(name.trim()).folded;
      if (!key) continue;
      const first = owner.get(key);
      if (first === undefined) owner.set(key, id);
      else if (first !== id) {
        warnings.push({ path: `glossary.${id}`, code: 'duplicate-glossary-name', message: `"${name.trim()}" is also a name of glossary term "${first}"; slides link it to "${first}"` });
      }
    }
  }
}

/** How far an overlay may stick out of the canvas before it is reported (rounding, nudging). */
const OVERLAY_TOLERANCE = 0.005;

/**
 * The fallback images of a slide's embeds (I-070): of embed slot values
 * (anything with `fallback`) and of embed blocks, with their paths.
 * @param {any} slide @param {string} at
 * @returns {[any, string][]}
 */
function embedFallbacks(slide, at) {
  /** @type {[any, string][]} */
  const found = [];
  for (const [name, value] of Object.entries(isObject(slide?.content) ? slide.content : {})) {
    if (isObject(value) && isImage(value.fallback)) found.push([value.fallback, `${at}.content.${name}.fallback`]);
  }
  arrayOf(slide?.reader?.blocks).forEach((block, j) => {
    if (block?.type !== 'image' && isImage(block?.fallback)) found.push([block.fallback, `${at}.reader.blocks[${j}].fallback`]);
  });
  return found;
}

/**
 * Embeds (I-070, I-071, D-011): `fallback`, `load`, `allow`, `aspect` and web
 * slots need show format 0.2. Web pages: an unsafe address is an error;
 * presenting as a screenshot without one, and same-origin on a file in the
 * show folder (ignored there), are warnings.
 * PDFs (I-072): the same address rules, a missing local file, and `page`
 * with `pages` or a reversed range are warnings.
 * @param {any} slide @param {string} at @param {unknown} version
 * @param {Issue[]} errors @param {Issue[]} warnings
 * @param {((src: string) => boolean) | undefined} fileExists
 */
function checkEmbeds(slide, at, version, errors, warnings, fileExists) {
  const message = 'this embed setting needs show format 0.2: set "slipr" to "0.2"';
  /** @param {any} value @param {string} path */
  const checkWeb = (value, path) => {
    if (/^\s*(javascript|data|vbscript):/i.test(String(value.url ?? ''))) {
      errors.push({ path: `${path}.url`, code: 'unsafe-url', message: 'this kind of address cannot be embedded' });
    }
    if (arrayOf(value.allow).includes('same-origin') && !/^\s*https?:/i.test(String(value.url ?? ''))) {
      warnings.push({ path: `${path}.allow`, code: 'same-origin-local', message: '"same-origin" is ignored for a file in the show folder: it would let the page reach the reader’s notes' });
    }
  };
  /** @param {any} value @param {string} path */
  const checkPdf = (value, path) => {
    const src = String(value.pdf ?? '');
    if (/^\s*(javascript|data|vbscript):/i.test(src)) {
      errors.push({ path: `${path}.pdf`, code: 'unsafe-url', message: 'this kind of address cannot be embedded' });
    } else if (fileExists && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !fileExists(src)) {
      warnings.push({ path: `${path}.pdf`, code: 'missing-file', message: `PDF file "${src}" not found` });
    }
    if (value.page !== undefined && value.pages !== undefined) {
      warnings.push({ path: `${path}.page`, code: 'pdf-page-and-pages', message: 'both "page" and "pages" are set; "pages" is used' });
    }
    if (Array.isArray(value.pages) && value.pages[0] > value.pages[1]) {
      warnings.push({ path: `${path}.pages`, code: 'pdf-pages-order', message: 'the first page comes after the last; the range is shown in order' });
    }
  };
  for (const [name, value] of Object.entries(isObject(slide.content) ? slide.content : {})) {
    if (!isObject(value)) continue;
    const path = `${at}.content.${name}`;
    if (typeof value.pdf === 'string') {
      if (version === '0.1') errors.push({ path, code: 'format-version', message: 'a PDF slot needs show format 0.2: set "slipr" to "0.2"' });
      checkPdf(value, path);
    } else if (typeof value.url === 'string') {
      if (version === '0.1') errors.push({ path, code: 'format-version', message: 'a web page slot needs show format 0.2: set "slipr" to "0.2"' });
      checkWeb(value, path);
      if (value.present === 'static' && !isImage(value.fallback)) {
        warnings.push({ path: `${path}.present`, code: 'static-without-fallback', message: 'presented as a screenshot, but there is no fallback image: the slide shows a link card' });
      }
    } else if (value.fallback !== undefined && version === '0.1') {
      errors.push({ path: `${path}.fallback`, code: 'format-version', message });
    }
  }
  arrayOf(slide.reader?.blocks).forEach((block, j) => {
    const path = `${at}.reader.blocks[${j}]`;
    if (version === '0.1') {
      for (const key of ['fallback', 'load', 'allow', 'aspect']) {
        if (block?.[key] !== undefined) errors.push({ path: `${path}.${key}`, code: 'format-version', message });
      }
    }
    if (block?.type === 'embed') checkWeb(block, path);
    if (block?.type === 'pdf') {
      if (version === '0.1') errors.push({ path, code: 'format-version', message: 'a PDF block needs show format 0.2: set "slipr" to "0.2"' });
      checkPdf(block, path);
    }
  });
}

/**
 * Extra images (D-013, I-083): only in format 0.2, and inside the canvas.
 * @param {any} slide @param {string} at @param {unknown} version
 * @param {Issue[]} errors @param {Issue[]} warnings
 */
function checkOverlays(slide, at, version, errors, warnings) {
  const overlays = arrayOf(slide.overlays);
  if (!overlays.length) return;
  if (version === '0.1') {
    errors.push({ path: `${at}.overlays`, code: 'format-version', message: 'extra images (overlays) need show format 0.2: set "slipr" to "0.2"' });
  }
  overlays.forEach((o, j) => {
    if (!isObject(o) || ![o.x, o.y, o.w, o.h].every((n) => typeof n === 'number')) return;
    if (o.w <= 0 || o.h <= 0) {
      warnings.push({ path: `${at}.overlays[${j}]`, code: 'empty-overlay', message: 'extra image has no size' });
    } else if (o.x + o.w > 1 + OVERLAY_TOLERANCE || o.y + o.h > 1 + OVERLAY_TOLERANCE) {
      warnings.push({ path: `${at}.overlays[${j}]`, code: 'outside-canvas', message: 'extra image sticks out of the slide' });
    }
  });
}

/**
 * Call fn for every Markdown-bearing string in the show.
 * @param {any} show
 * @param {(text: string, path: string) => void} fn
 */
function forEachMarkdown(show, fn) {
  const visit = (/** @type {any} */ value, /** @type {string} */ path) => {
    if (typeof value === 'string') fn(value, path);
    else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
    else if (isObject(value) && !isImage(value)) {
      for (const [k, v] of Object.entries(value)) if (typeof v === 'string') fn(v, `${path}.${k}`);
    }
  };
  if (isObject(show.glossary)) {
    for (const [id, term] of Object.entries(show.glossary)) visit(term?.definition, `glossary.${id}.definition`);
  }
  arrayOf(show.slides).forEach((slide, i) => {
    const at = `slides[${i}]`;
    for (const [name, value] of Object.entries(isObject(slide?.content) ? slide.content : {})) {
      visit(value, `${at}.content.${name}`);
    }
    visit(slide?.notes, `${at}.notes`);
    arrayOf(slide?.reader?.blocks).forEach((block, j) => {
      const bat = `${at}.reader.blocks[${j}]`;
      visit(block?.md, `${bat}.md`);
      arrayOf(block?.tabs).forEach((tab, k) => visit(tab?.md, `${bat}.tabs[${k}].md`));
      arrayOf(block?.hotspots).forEach((spot, k) => visit(spot?.md, `${bat}.hotspots[${k}].md`));
    });
  });
}

/**
 * Collect ids of a list of {id} objects, reporting duplicates.
 * @param {any} list @param {string} name @param {Issue[]} errors
 * @returns {Set<string>}
 */
function collectIds(list, name, errors) {
  const ids = new Set();
  arrayOf(list).forEach((item, i) => {
    if (!isObject(item) || typeof item.id !== 'string') return;
    if (ids.has(item.id)) {
      errors.push({ path: `${name}[${i}].id`, code: 'duplicate-id', message: `duplicate id "${item.id}" in ${name}` });
    }
    ids.add(item.id);
  });
  return ids;
}

/** @param {any} template @returns {Map<string, any> | null} */
function templateLayouts(template) {
  if (!isObject(template) || !Array.isArray(template.layouts)) return null;
  return new Map(template.layouts.filter(isObject).map((l) => [l.id, l]));
}

/** @param {any} value @param {string} type */
function matchesSlotType(value, type) {
  switch (type) {
    case 'text':
    case 'richtext': return typeof value === 'string';
    case 'list': return typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
    case 'image': return isImage(value);
    case 'code': return isObject(value) && typeof value.code === 'string';
    case 'quote': return isObject(value) && typeof value.text === 'string';
    case 'chart': return isObject(value) && typeof value.kind === 'string';
    case 'diagram': return isObject(value) && typeof value.mermaid === 'string';
    case 'web': return isObject(value) && typeof value.url === 'string';
    case 'pdf': return isObject(value) && typeof value.pdf === 'string';
    case 'cards': return Array.isArray(value) && value.every(isObject);
    default: return true;
  }
}

/** @param {string} type */
function slotTypeLabel(type) {
  return {
    text: 'plain text (a string)',
    richtext: 'Markdown text (a string)',
    list: 'a Markdown bullet list (string) or an array of strings',
    image: 'an image object { "src": ..., "alt": ... }',
    code: 'a code object { "language": ..., "code": ... }',
    quote: 'a quote object { "text": ..., "source": ... }',
    chart: 'a chart object { "kind": ..., "data": ... }',
    diagram: 'a diagram object { "mermaid": ... }',
    web: 'a web page object { "url": ..., "title": ... }',
    pdf: 'a PDF object { "pdf": ..., "title": ... }',
    cards: 'an array of card objects',
  }[type] ?? type;
}

/** @param {any} value */
function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** @param {any} value @returns {boolean} */
function isImage(value) {
  return isObject(value) && typeof value.src === 'string';
}

/** @param {any} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {any} value @returns {any[]} */
function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {string} s @returns {number[] | null} */
function parseVersion(s) {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** @param {number[]} a @param {number[]} b */
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** @param {Issue[]} errors @param {Issue[]} warnings @returns {ValidationResult} */
function result(errors, warnings) {
  return { ok: errors.length === 0, errors, warnings };
}
