// @ts-check
/**
 * Value shapes for the cards, quote and code field editors (E-004, I-035).
 * DOM-free, so it can be tested with node --test. Every function returns a new
 * value (the store's show is immutable) and never a shape the format rejects:
 * cards are an array of objects, a quote is `{ text, source? }`, code is
 * `{ language?, code }` (docs/show-format.md, "Slot value types").
 */

/**
 * A copy of a cards value as an array of card objects.
 * @param {any} value
 * @returns {Record<string, any>[]}
 */
export function cardsArray(value) {
  return Array.isArray(value) ? value.map((c) => (c && typeof c === 'object' && !Array.isArray(c) ? c : {})) : [];
}

/**
 * The slot value for a list of cards: undefined (slot removed) when empty.
 * @param {Record<string, any>[]} cards
 * @returns {Record<string, any>[] | undefined}
 */
export function cardsValue(cards) {
  return cards.length ? cards : undefined;
}

/**
 * Set one field of one card. `undefined` (an emptied field) removes the field.
 * @param {any} cards
 * @param {number} index
 * @param {string} field
 * @param {any} value
 * @returns {Record<string, any>[]}
 */
export function withCardField(cards, index, field, value) {
  return cardsArray(cards).map((card, i) => {
    if (i !== index) return card;
    const next = { ...card };
    if (value === undefined || value === '') delete next[field];
    else next[field] = value;
    return next;
  });
}

/**
 * Append an empty card, unless `maxItems` is reached.
 * @param {any} cards
 * @param {number} [maxItems]
 * @returns {Record<string, any>[]}
 */
export function addCard(cards, maxItems) {
  const list = cardsArray(cards);
  if (maxItems && list.length >= maxItems) return list;
  return [...list, {}];
}

/**
 * @param {any} cards
 * @param {number} index
 * @returns {Record<string, any>[]}
 */
export function removeCard(cards, index) {
  return cardsArray(cards).filter((_, i) => i !== index);
}

/**
 * Move a card to another position (clamped to the list).
 * @param {any} cards
 * @param {number} from
 * @param {number} to
 * @returns {Record<string, any>[]}
 */
export function moveCard(cards, from, to) {
  const list = cardsArray(cards);
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  const [card] = list.splice(from, 1);
  list.splice(target, 0, card);
  return list;
}

/**
 * A quote slot value `{ text, source? }`. Both empty removes the slot.
 * @param {any} previous
 * @param {{ text?: string, source?: string }} change
 * @returns {{ text: string, source?: string } | undefined}
 */
export function quoteValue(previous, change) {
  const base = previous && typeof previous === 'object' ? previous : {};
  const text = change.text ?? (typeof base.text === 'string' ? base.text : '');
  const source = change.source ?? base.source ?? '';
  if (!text && !source) return undefined;
  const next = { ...base, text };
  if (source) next.source = source;
  else delete next.source;
  return next;
}

/**
 * A code slot value `{ language?, code }`. Both empty removes the slot.
 * @param {any} previous
 * @param {{ language?: string, code?: string }} change
 * @returns {{ language?: string, code: string } | undefined}
 */
export function codeValue(previous, change) {
  const base = previous && typeof previous === 'object' ? previous : {};
  const code = change.code ?? (typeof base.code === 'string' ? base.code : '');
  const language = (change.language ?? base.language ?? '').trim();
  if (!code && !language) return undefined;
  const next = { ...base, code };
  if (language) next.language = language;
  else delete next.language;
  return next;
}

/**
 * "12 / 18" for a field with a maximum length, and whether it is too long.
 * @param {string | undefined} text
 * @param {number | undefined} maxLength
 * @returns {{ text: string, over: boolean } | null}
 */
export function lengthHint(text, maxLength) {
  if (!maxLength) return null;
  const length = (text ?? '').length;
  return { text: `${length} / ${maxLength}`, over: length > maxLength };
}
