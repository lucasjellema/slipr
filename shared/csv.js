// @ts-check
/**
 * A small CSV reader for table data (I-104). RFC 4180 quoting ("a ""b"" c",
 * line breaks inside quotes), comma, semicolon or tab separated (detected from
 * the first line), CRLF or LF, and a byte-order mark is ignored. DOM-free and
 * dependency-free (D-001).
 */

/**
 * The separator used on the first line: the most frequent of `,` `;` and tab
 * outside quotes (comma when none appears).
 * @param {string} text
 * @returns {',' | ';' | '\t'}
 */
export function detectDelimiter(text) {
  /** @type {Record<string, number>} */
  const count = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in count) count[ch]++;
  }
  const best = /** @type {[',' | ';' | '\t', number][]} */ (Object.entries(count)).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/**
 * Parse CSV text into rows of strings. Empty lines are skipped.
 * @param {string} text
 * @param {{ delimiter?: ',' | ';' | '\t' }} [options]
 * @returns {string[][]}
 */
export function parseCsv(text, options = {}) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const delimiter = options.delimiter ?? detectDelimiter(src);
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length || wasQuoted) endRow();
  return rows;
}

/**
 * Write rows as CSV (comma separated, quoted where needed, CRLF line ends).
 * @param {(string | number | null | undefined)[][]} rows
 * @param {{ delimiter?: ',' | ';' | '\t' }} [options]
 * @returns {string}
 */
export function toCsv(rows, options = {}) {
  const delimiter = options.delimiter ?? ',';
  const cell = (/** @type {unknown} */ v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(delimiter)).join('\r\n');
}
