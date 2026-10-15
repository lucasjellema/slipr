// @ts-check
/**
 * Video values in the editor (I-110): the value from the previous one and a
 * patch, the source line under the address, times as typed, chapters and
 * captions. DOM-free, tested in editor/test/video-values.test.js.
 */
import { formatTime, looksLikeVideoFile, parseTime, videoChapters, videoSource } from '../../shared/embeds/video.js';

/** The fields of a video value or block the editor writes. */
export const VIDEO_FIELDS = ['video', 'title', 'start', 'end', 'play', 'chapterSteps', 'muted', 'loop', 'controls', 'captions', 'chapters', 'transcript', 'caption', 'present', 'load', 'fallback'];

/**
 * A video value (slot or block) from the previous value and a patch. Always
 * has `video` and a non-empty `title`; an empty title in the patch is
 * ignored; fields patched to undefined (or "") are removed.
 * @param {any} previous
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
export function videoValue(previous, patch) {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  /** @type {Record<string, any>} */
  const next = { video: '', title: 'Video', ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'title' && !String(value ?? '').trim()) continue;
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
  }
  if (next.video === undefined) next.video = '';
  return next;
}

/**
 * What the editor says under the address: where the video comes from, or
 * what is wrong with it.
 * @param {string} url
 * @returns {{ level: 'info' | 'warning' | 'error', message: string }}
 */
export function videoSourceNote(url) {
  const value = String(url ?? '').trim();
  if (!value) return { level: 'error', message: 'Choose a video file, or enter a YouTube, Vimeo or video file address.' };
  if (/^(javascript|data|vbscript):/i.test(value)) return { level: 'error', message: 'This kind of address is not allowed.' };
  const source = videoSource(value);
  if (source.kind === 'youtube') return { level: 'info', message: `YouTube video ${source.id}: plays in YouTube's privacy-friendly player (youtube-nocookie.com). Readers click Load first.` };
  if (source.kind === 'vimeo') return { level: 'info', message: `Vimeo video ${source.id}: plays in Vimeo's player without tracking (dnt). Readers click Load first.` };
  if (!source.origin) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return { level: 'error', message: 'A video is a file in the show folder or an http(s) address.' };
    return { level: 'info', message: 'A video file in the show folder: plays offline, also in an exported file (up to 25 MB).' };
  }
  if (!looksLikeVideoFile(value)) return { level: 'warning', message: 'This is not a YouTube or Vimeo link, nor a video file (.mp4, .webm). For other video sites, use an Embedded Page block.' };
  return { level: 'info', message: `A video file on ${source.label}. Readers click Load first.` };
}

/**
 * Is this the address of a YouTube or Vimeo video (so an Embedded Page block
 * could be a video block)?
 * @param {string} url
 */
export function isVideoSiteUrl(url) {
  return videoSource(String(url ?? '')).kind !== 'file';
}

/**
 * A time as shown in a field: `1:05`, or "" for none.
 * @param {unknown} seconds
 */
export function timeText(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? formatTime(seconds) + (seconds % 1 ? `.${String(seconds).split('.')[1]}` : '') : '';
}

/**
 * Seconds from what was typed (`90`, `1:30`, `1m30s`), or undefined for
 * empty or unreadable text.
 * @param {string} text
 * @returns {number | undefined}
 */
export function timeFromText(text) {
  return parseTime(text) ?? undefined;
}

/**
 * The chapters with one added: a minute after the last (or at 0:00).
 * @param {any[] | undefined} chapters
 * @returns {{ time: number, title: string }[]}
 */
export function addChapter(chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  const last = list.reduce((max, c) => (typeof c?.time === 'number' && c.time > max ? c.time : max), -1);
  return [...list, { time: last < 0 ? 0 : last + 60, title: `Chapter ${list.length + 1}` }];
}

/**
 * The chapters with chapter `index` patched (`time` from text, `title`).
 * @param {any[] | undefined} chapters @param {number} index
 * @param {{ time?: string, title?: string }} patch
 * @returns {any[]}
 */
export function setChapter(chapters, index, patch) {
  return (Array.isArray(chapters) ? chapters : []).map((c, i) => {
    if (i !== index) return c;
    const next = { ...c };
    if (patch.time !== undefined) {
      const t = timeFromText(patch.time);
      if (t !== undefined) next.time = t;
    }
    if (patch.title !== undefined) next.title = patch.title;
    return next;
  });
}

/**
 * The chapters without chapter `index`, or undefined when none are left.
 * @param {any[] | undefined} chapters @param {number} index
 * @returns {any[] | undefined}
 */
export function removeChapter(chapters, index) {
  const list = (Array.isArray(chapters) ? chapters : []).filter((_, i) => i !== index);
  return list.length ? list : undefined;
}

/**
 * The `captions` value from its fields, or undefined without a file.
 * @param {string} src @param {string} [label] @param {string} [lang]
 * @returns {{ src: string, label?: string, lang?: string } | undefined}
 */
export function captionsValue(src, label = '', lang = '') {
  const file = String(src ?? '').trim();
  if (!file) return undefined;
  return { src: file, ...(label.trim() ? { label: label.trim() } : {}), ...(lang.trim() ? { lang: lang.trim() } : {}) };
}

/**
 * One line about a video, for summaries: title, source and chapters.
 * @param {any} value
 */
export function videoSummary(value) {
  const url = String(value?.video ?? '');
  const source = url ? videoSource(url) : null;
  const chapters = videoChapters(value).length;
  return `${value?.title || 'Video'}: ${!source ? '(no video yet)' : source.kind === 'file' ? url : `${source.label} ${source.id}`}${chapters ? `, ${chapters} chapter${chapters === 1 ? '' : 's'}` : ''}`;
}
