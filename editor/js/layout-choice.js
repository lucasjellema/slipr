// @ts-check
/**
 * What choosing a layout does to a slide (E-004 layout picker). DOM-free.
 * The picker shows each layout with the current slide's content in it, and
 * what would be hidden, brought back, or still needed.
 */
import { setLayout } from './actions.js';

/**
 * The display name of a layout definition.
 * @param {any} def
 * @returns {string}
 */
export function layoutName(def) {
  return def?.name ?? def?.title ?? def?.id ?? '';
}

/**
 * The slide as it would be after switching to `layoutId` (the same rules as the
 * setLayout action: slots the new layout lacks are kept aside in `_orphaned`).
 * @param {any} slide
 * @param {string} layoutId
 * @param {any[]} templateLayouts  `template.layouts`
 * @returns {any}
 */
export function slideInLayout(slide, layoutId, templateLayouts) {
  const byId = Object.fromEntries((templateLayouts ?? []).map((/** @type {any} */ l) => [l.id, l]));
  return setLayout({ slides: [slide] }, { slideId: slide.id, layout: layoutId, templateLayouts: byId }).slides[0];
}

/** @param {any} value */
const hasValue = (value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

/**
 * What a layout change does to the slide's content, as slot labels.
 * @param {any} slide   The slide now.
 * @param {any} next    The slide after the change (from slideInLayout).
 * @param {any[]} templateLayouts  `template.layouts`
 * @returns {{ hidden: string[], restored: string[], needed: string[] }}
 *   Content set aside (restored when switching back), content brought back
 *   from an earlier switch, and required slots that would still be empty.
 */
export function layoutChangeEffects(slide, next, templateLayouts) {
  const defOf = (/** @type {string} */ id) => (templateLayouts ?? []).find((/** @type {any} */ l) => l.id === id);
  const oldDef = defOf(slide.layout);
  const newDef = defOf(next.layout);
  const label = (/** @type {any} */ def, /** @type {string} */ name) => def?.slots?.find((/** @type {any} */ s) => s.name === name)?.label ?? name;
  const before = slide.content ?? {};
  const after = next.content ?? {};
  const hidden = Object.keys(before).filter((k) => hasValue(before[k]) && !(k in after)).map((k) => label(oldDef, k));
  const restored = Object.keys(after).filter((k) => !(k in before) && hasValue(after[k])).map((k) => label(newDef, k));
  const needed = (newDef?.slots ?? [])
    .filter((/** @type {any} */ s) => s.required && !hasValue(after[s.name]))
    .map((/** @type {any} */ s) => s.label ?? s.name);
  return { hidden, restored, needed };
}

/**
 * Sample content for previewing a layout on a new slide: each text slot shows
 * its label, lists and rich text a few lines, cards a few cards. Images stay empty.
 * @param {any} def
 * @returns {Record<string, any>}
 */
export function sampleContent(def) {
  /** @type {Record<string, any>} */
  const content = {};
  for (const slot of def?.slots ?? []) {
    const label = slot.label ?? slot.name;
    if (slot.type === 'text') content[slot.name] = label;
    else if (slot.type === 'list') content[slot.name] = '- First point\n- Second point\n- Third point';
    else if (slot.type === 'richtext') content[slot.name] = `${label}: a short paragraph of text.`;
    else if (slot.type === 'quote') content[slot.name] = { text: 'A memorable quote.', source: 'Someone' };
    else if (slot.type === 'code') content[slot.name] = { language: 'js', code: 'const answer = 42;' };
    else if (slot.type === 'cards') {
      const count = Math.min(slot.maxItems ?? 3, 3);
      content[slot.name] = Array.from({ length: count }, (_, i) => Object.fromEntries(
        (slot.fields ?? [])
          .filter((/** @type {any} */ f) => f.type !== 'image')
          .map((/** @type {any} */ f) => [f.name, f.type === 'text' ? `${f.label ?? f.name} ${i + 1}` : 'Short text.'])
      ));
    }
  }
  return content;
}
