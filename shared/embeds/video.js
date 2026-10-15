// @ts-check
/**
 * Embed kind `video`: a video (I-110), as the audience `video` slot and the
 * reader `video` block. Follows the embed kind contract of ./index.js.
 *
 * - The value names the video in `video` (not `src`, so it is never taken for
 *   an image value): a file in the show folder, a YouTube or Vimeo link, or an
 *   https link to a video file. `fallback` is the poster.
 * - Files play in the browser's own <video> element; YouTube and Vimeo in
 *   their privacy-friendly players (youtube-nocookie.com, Vimeo `dnt=1`),
 *   driven with their postMessage commands, so no player library is loaded.
 * - Audience slot: pauses when its slide is left; `play: "slide"` starts it
 *   when the slide appears, `play: "step"` on a hidden Reveal fragment;
 *   `chapterSteps` adds one fragment per further chapter (each click jumps).
 *   `present: "static"` shows only the poster or card.
 * - Reader mode: another server is click-to-load unless `load: "auto"`. A
 *   block lists its chapters (buttons that seek) and a collapsible transcript;
 *   a slot gets a compact bar with a chapter menu and a Transcript dialog.
 *
 * The markup functions and the address helpers are DOM-free; hydration needs a browser.
 */
import { escape, markdown } from '../markdown.js';
import { externalOrigin } from './consent.js';

/** No library: the browser's own player, or the site's. */
export const library = null;
/** Not rendered in editor thumbnails (a video can be large, or on another server). */
export const thumbnail = false;
/** Label of the error box when the video cannot be shown. */
export const errorLabel = 'Video could not be shown';
/** File extensions played as video files. */
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
/** The single-file export embeds video files up to this size (Lucas, 2026-10-15). */
export const EXPORT_VIDEO_LIMIT = 25 * 1024 * 1024;
/** The sandbox of a YouTube or Vimeo player frame (another server: same-origin is its own). */
export const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
/** The frame permissions of a YouTube or Vimeo player. */
export const PLAYER_ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture';

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const VIMEO_ORIGIN = 'https://player.vimeo.com';

/**
 * Is this a video value (slot value or block)?
 * @param {any} value
 */
export function isVideo(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.video === 'string');
}

/**
 * Seconds from a time: a number, `"90"`, `"1:30"`, `"1:02:03"` or `"1m30s"`.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(text);
  if (units && (units[1] || units[2] || units[3])) return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  return null;
}

/**
 * A time for people: `0:05`, `12:34`, `1:02:03`.
 * @param {number} seconds
 */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/**
 * @typedef {object} VideoSource
 * @property {'file' | 'youtube' | 'vimeo'} kind
 * @property {string} [id]      YouTube or Vimeo video id.
 * @property {string} [hash]    Vimeo's hash of an unlisted video.
 * @property {number} [start]   A start time in the link itself (YouTube `t=`).
 * @property {string | null} origin  The server it comes from (null: the show folder).
 * @property {string} label     For cards and the editor: "YouTube", "Vimeo", a host, or "File in this show".
 */

/**
 * Recognise where a video comes from. Anything that is not a YouTube or
 * Vimeo link is a video file (in the show folder, or at an http(s) address).
 * @param {string} url
 * @returns {VideoSource}
 */
export function videoSource(url) {
  const text = String(url ?? '').trim();
  const origin = externalOrigin(text);
  if (!origin) return { kind: 'file', origin: null, label: 'File in this show' };
  let u;
  try {
    u = new URL(text);
  } catch {
    return { kind: 'file', origin, label: origin };
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const ID = /^[A-Za-z0-9_-]{11}$/;
  /** @type {string | null} */
  let youtube = null;
  if (host === 'youtu.be') youtube = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') youtube = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) youtube = parts[1] ?? null;
  }
  if (youtube && ID.test(youtube)) {
    const t = parseTime(u.searchParams.get('t') ?? u.searchParams.get('start') ?? '');
    return { kind: 'youtube', id: youtube, ...(t ? { start: t } : {}), origin: YOUTUBE_ORIGIN, label: 'YouTube' };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.findIndex((p) => /^\d+$/.test(p));
    if (at >= 0) {
      const next = parts[at + 1];
      const hash = u.searchParams.get('h') ?? (next && /^[0-9a-f]{6,}$/i.test(next) ? next : null);
      return { kind: 'vimeo', id: parts[at], ...(hash ? { hash } : {}), origin: VIMEO_ORIGIN, label: 'Vimeo' };
    }
  }
  return { kind: 'file', origin, label: u.host };
}

/**
 * Is this a video file address (by extension)? For validation: an https
 * address that is neither YouTube, Vimeo nor a video file is a web page.
 * @param {string} url
 */
export function looksLikeVideoFile(url) {
  const path = String(url ?? '').split(/[?#]/)[0];
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return Boolean(ext && VIDEO_EXTENSIONS.includes(ext));
}

/**
 * The start and end of a value, in seconds (end null: to the end). The link's
 * own start time counts when `start` is not set.
 * @param {any} value
 * @returns {[number, number | null]}
 */
export function playRange(value) {
  const source = videoSource(String(value?.video ?? ''));
  const start = parseTime(value?.start) ?? source.start ?? 0;
  const end = parseTime(value?.end);
  return [start, end !== null && end > start ? end : null];
}

/**
 * The chapters of a value with a valid time and title, in time order.
 * @param {any} value
 * @returns {{ time: number, title: string }[]}
 */
export function videoChapters(value) {
  return (Array.isArray(value?.chapters) ? value.chapters : [])
    .map((/** @type {any} */ c) => ({ time: parseTime(c?.time), title: typeof c?.title === 'string' ? c.title.trim() : '' }))
    .filter((/** @type {any} */ c) => c.time !== null && c.title)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.time - b.time);
}

/**
 * The address the video plays from: the YouTube or Vimeo player, an http(s)
 * file as it is, or a file in the show folder relative to show.json.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 */
export function videoUrl(value, ctx) {
  const url = String(value?.video ?? '').trim();
  const source = videoSource(url);
  const [start, end] = playRange(value);
  if (source.kind === 'youtube') {
    const params = new URLSearchParams({ rel: '0', enablejsapi: '1', playsinline: '1' });
    if (start) params.set('start', String(Math.floor(start)));
    if (end) params.set('end', String(Math.ceil(end)));
    if (value?.muted) params.set('mute', '1');
    if (value?.loop) {
      params.set('loop', '1');
      params.set('playlist', /** @type {string} */ (source.id));
    }
    if (value?.controls === false) params.set('controls', '0');
    return `${YOUTUBE_ORIGIN}/embed/${source.id}?${params}`;
  }
  if (source.kind === 'vimeo') {
    const params = new URLSearchParams({ dnt: '1' });
    if (source.hash) params.set('h', source.hash);
    if (value?.muted) params.set('muted', '1');
    if (value?.loop) params.set('loop', '1');
    if (value?.controls === false) params.set('controls', '0');
    return `${VIMEO_ORIGIN}/video/${source.id}?${params}${start ? `#t=${Math.floor(start)}s` : ''}`;
  }
  return /^https?:/i.test(url) ? url : ctx.resolveAsset(url);
}

/**
 * The address to watch the video outside Slipr (cards, "Watch ↗").
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 */
export function watchUrl(value, ctx) {
  const url = String(value?.video ?? '').trim();
  const source = videoSource(url);
  if (source.kind === 'youtube') return `https://www.youtube.com/watch?v=${source.id}`;
  if (source.kind === 'vimeo') return `https://vimeo.com/${source.id}${source.hash ? `/${source.hash}` : ''}`;
  return /^https?:/i.test(url) ? url : ctx.resolveAsset(url);
}

/**
 * Every video in a show, with where it is: `blockId` is the block's id, or
 * `slot:<name>` for a slot (the same ids reader search uses). DOM-free.
 * @param {any} show
 * @returns {{ slideId: string, blockId: string, value: any }[]}
 */
export function videoEntries(show) {
  /** @type {{ slideId: string, blockId: string, value: any }[]} */
  const found = [];
  for (const slide of Array.isArray(show?.slides) ? show.slides : []) {
    for (const [name, value] of Object.entries(slide?.content && typeof slide.content === 'object' ? slide.content : {})) {
      if (isVideo(value)) found.push({ slideId: slide.id, blockId: `slot:${name}`, value });
    }
    for (const block of Array.isArray(slide?.reader?.blocks) ? slide.reader.blocks : []) {
      if (block?.type === 'video' && isVideo(block)) found.push({ slideId: slide.id, blockId: block.id, value: block });
    }
  }
  return found;
}

/**
 * The show-folder files a video needs: the video file and its captions.
 * @param {any} value
 * @returns {string[]}
 */
export function videoFiles(value) {
  const local = (/** @type {unknown} */ p) => typeof p === 'string' && p.trim() !== '' && !/^[a-z][a-z0-9+.-]*:|^\//i.test(p.trim());
  const files = [];
  if (local(value?.video)) files.push(String(value.video).trim());
  if (local(value?.captions?.src) && videoSource(String(value?.video ?? '')).kind === 'file') files.push(String(value.captions.src).trim());
  return files;
}

/**
 * @typedef {object} VideoOptions
 * @property {'audience' | 'reader'} [mode]  Default 'reader'.
 * @property {boolean} [slot]  A slot on a slide (the layout sizes it), not a reader block.
 */

/**
 * Attributes of the embed element.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {VideoOptions} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  const mode = options.mode ?? 'reader';
  const source = videoSource(String(value?.video ?? ''));
  const [start, end] = playRange(value);
  /** @type {Record<string, string>} */
  const attrs = {
    'data-embed-video': videoUrl(value, ctx),
    'data-embed-title': String(value?.title ?? ''),
    'data-video-kind': source.kind,
    'data-video-mode': mode,
    'data-video-start': String(start),
    'data-embed-print': 'fallback',
  };
  if (end !== null) attrs['data-video-end'] = String(end);
  if (value?.muted) attrs['data-video-muted'] = '';
  if (value?.loop) attrs['data-video-loop'] = '';
  if (value?.controls === false) attrs['data-video-nocontrols'] = '';
  if (options.slot) attrs['data-video-slot'] = '';
  const poster = value?.fallback;
  if (poster && typeof poster === 'object' && typeof poster.src === 'string' && poster.src) attrs['data-video-poster'] = ctx.resolveAsset(poster.src);
  if (source.kind === 'file' && typeof value?.captions?.src === 'string' && value.captions.src) {
    attrs['data-video-captions'] = ctx.resolveAsset(value.captions.src);
    attrs['data-video-captions-label'] = String(value.captions.label ?? value.captions.lang ?? 'Captions');
    if (typeof value.captions.lang === 'string') attrs['data-video-captions-lang'] = value.captions.lang;
  }
  if (mode === 'audience') {
    if (value?.present === 'static') attrs['data-embed-static'] = '';
    if (options.slot && (value?.play === 'slide' || value?.play === 'step')) attrs['data-video-play'] = value.play;
  } else if (source.origin && value?.load !== 'auto') {
    attrs['data-embed-origin'] = source.origin;
  }
  return attrs;
}

/**
 * Static content without a poster: a card with the title, the source and a
 * "Watch" link.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @returns {{ html: string, fallback: 'card' }}
 */
export function staticHtml(value, ctx) {
  const source = videoSource(String(value?.video ?? ''));
  const [start] = playRange(value);
  return {
    html: `<div class="slipr-embed-card slipr-video-card"><span class="slipr-embed-card-title">▶ ${escape(String(value?.title ?? ''))}</span>`
      + `<span class="slipr-embed-card-site">Video${start ? ` from ${formatTime(start)}` : ''} · ${escape(source.label)}</span>`
      + `<a class="slipr-embed-card-link" href="${escape(watchUrl(value, ctx))}" target="_blank" rel="noopener noreferrer">Watch ↗</a></div>`,
    fallback: 'card',
  };
}

/**
 * Extra markup after the fallback:
 * - audience slot: hidden Reveal fragments for `play: "step"` and `chapterSteps`;
 * - reader block: the chapter list and the transcript;
 * - reader slot: a bar with a chapter menu and a Transcript button (and its dialog).
 * @param {any} value
 * @param {VideoOptions} [options]
 */
export function afterHtml(value, options = {}) {
  const mode = options.mode ?? 'reader';
  const chapters = videoChapters(value);
  if (mode === 'audience') {
    if (!options.slot || value?.present === 'static') return '';
    let html = value?.play === 'step' ? '<span class="fragment slipr-video-step" data-video-action="play" aria-hidden="true"></span>' : '';
    if (value?.chapterSteps) {
      for (const c of chapters.slice(1)) html += `<span class="fragment slipr-video-step" data-video-time="${c.time}" aria-hidden="true"></span>`;
    }
    return html;
  }
  const transcript = typeof value?.transcript === 'string' && value.transcript.trim() ? markdown(value.transcript, { mode: 'reader' }) : '';
  const title = escape(String(value?.title ?? 'the video'));
  if (options.slot) {
    if (!chapters.length && !transcript) return '';
    let html = '<div class="slipr-video-bar">';
    if (chapters.length) {
      html += `<select class="slipr-video-chapter-menu" aria-label="${title}: go to chapter"><option value="">Chapter…</option>`
        + chapters.map((c) => `<option value="${c.time}">${formatTime(c.time)} ${escape(c.title)}</option>`).join('')
        + '</select>';
    }
    if (transcript) {
      html += '<button type="button" class="slipr-video-transcript-open">Transcript</button>'
        + `<dialog class="slipr-video-transcript-dialog" aria-label="Transcript: ${title}"><div class="slipr-video-transcript-body">${transcript}</div>`
        + '<form method="dialog"><button class="slipr-video-transcript-close">Close</button></form></dialog>';
    }
    return `${html}</div>`;
  }
  let html = '';
  if (chapters.length) {
    html += `<ol class="slipr-video-chapters" aria-label="Chapters of ${title}">`
      + chapters.map((c) => `<li><button type="button" class="slipr-video-chapter" data-video-time="${c.time}">`
        + `<span class="slipr-video-chapter-time">${formatTime(c.time)}</span> <span class="slipr-video-chapter-title">${escape(c.title)}</span></button></li>`).join('')
      + '</ol>';
  }
  if (transcript) html += `<details class="slipr-video-transcript"><summary>Transcript</summary>${transcript}</details>`;
  return html;
}

// ---------------------------------------------------------------------------
// Browser part: the player.

/**
 * @typedef {object} Player
 * @property {() => void} play
 * @property {() => void} pause
 * @property {(seconds: number) => void} seek
 */

/**
 * Render the player into `live` and wire chapters, steps and the slide.
 * Listens for `slipr:video-seek` (detail: seconds), e.g. from a search
 * result; `data-video-goto` sets the time to open at.
 * @param {HTMLElement} el  The embed element (carries the data-* attributes).
 * @param {HTMLElement} live
 */
export async function hydrate(el, live) {
  const src = el.dataset.embedVideo ?? '';
  if (!src || /^\s*(javascript|data|vbscript):/i.test(src)) throw new Error('This address cannot be played.');
  const doc = el.ownerDocument;
  const kind = el.dataset.videoKind ?? 'file';
  const title = el.dataset.embedTitle ?? '';
  const start = Number(el.dataset.videoStart) || 0;
  const end = el.dataset.videoEnd ? Number(el.dataset.videoEnd) : null;
  const bundle = /** @type {any} */ (globalThis).SLIPR_BUNDLE;

  /** @type {Player} */
  let player;
  if (kind === 'file') {
    const video = doc.createElement('video');
    video.className = 'slipr-video-player';
    video.src = bundle?.url(src) ?? src;
    video.preload = 'metadata';
    video.playsInline = true;
    video.title = title;
    video.setAttribute('aria-label', title);
    const controls = el.dataset.videoNocontrols === undefined;
    video.controls = controls;
    video.muted = el.dataset.videoMuted !== undefined;
    video.defaultMuted = video.muted;
    const loop = el.dataset.videoLoop !== undefined;
    video.loop = loop && end === null;
    if (el.dataset.videoPoster) video.poster = bundle?.url(el.dataset.videoPoster) ?? el.dataset.videoPoster;
    if (el.dataset.videoCaptions) {
      const track = doc.createElement('track');
      track.kind = 'captions';
      track.src = bundle?.url(el.dataset.videoCaptions) ?? el.dataset.videoCaptions;
      track.label = el.dataset.videoCaptionsLabel ?? 'Captions';
      if (el.dataset.videoCaptionsLang) track.srclang = el.dataset.videoCaptionsLang;
      track.default = true;
      video.append(track);
    }
    if (!controls) {
      // Still playable without controls: a click, Space or Enter toggles.
      video.tabIndex = 0;
      const toggle = () => (video.paused ? player.play() : player.pause());
      video.addEventListener('click', toggle);
      video.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      });
    }
    const goto = Number(el.dataset.videoGoto);
    video.addEventListener('loadedmetadata', () => {
      if (video.currentTime < start || goto) video.currentTime = goto || start;
    }, { once: true });
    video.addEventListener('timeupdate', () => {
      if (end !== null && video.currentTime >= end) {
        if (loop) video.currentTime = start;
        else video.pause();
      }
    });
    video.addEventListener('error', () => {
      if (el.querySelector(':scope > .slipr-embed-error')) return;
      const box = doc.createElement('div');
      box.className = 'slipr-embed-error';
      box.setAttribute('role', 'note');
      const badge = doc.createElement('span');
      badge.className = 'slipr-embed-error-badge';
      badge.textContent = errorLabel;
      const text = doc.createElement('pre');
      text.className = 'slipr-embed-error-text';
      text.textContent = bundle ? 'This video is not inside this file (too large to export).' : 'The video file could not be played.';
      box.append(badge, text);
      el.append(box);
    });
    player = {
      play: () => {
        video.play().catch((err) => {
          // Browsers may refuse sound without a click: try again muted.
          if (err?.name === 'NotAllowedError' && !video.muted) {
            video.muted = true;
            video.play().catch(() => {});
          }
        });
      },
      pause: () => video.pause(),
      seek: (t) => { video.currentTime = t; },
    };
    live.replaceChildren(video);
    // The chapter being played, in the chapter list.
    const chapterButtons = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('.slipr-video-chapter')]);
    if (chapterButtons.length) {
      video.addEventListener('timeupdate', () => {
        let current = -1;
        chapterButtons.forEach((b, i) => { if (Number(b.dataset.videoTime) <= video.currentTime + 0.25) current = i; });
        chapterButtons.forEach((b, i) => {
          if (i === current) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        });
      });
    }
  } else {
    const frame = doc.createElement('iframe');
    frame.className = 'slipr-video-player slipr-video-frame';
    frame.src = src;
    frame.title = title;
    frame.setAttribute('sandbox', PLAYER_SANDBOX);
    frame.allow = PLAYER_ALLOW;
    frame.allowFullscreen = true;
    // YouTube refuses to play without a referrer; send the origin only.
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    const target = new URL(src).origin;
    let ready = false;
    /** @type {any[]} */
    const queue = [];
    /** @param {any} message */
    const send = (message) => {
      if (!ready) {
        queue.push(message);
        return;
      }
      frame.contentWindow?.postMessage(JSON.stringify(message), target);
    };
    frame.addEventListener('load', () => {
      // The players take a moment after `load` before they listen.
      setTimeout(() => {
        ready = true;
        for (const m of queue.splice(0)) send(m);
      }, 600);
    });
    const goto = Number(el.dataset.videoGoto);
    player = kind === 'youtube'
      ? {
        play: () => send({ event: 'command', func: 'playVideo', args: [] }),
        pause: () => send({ event: 'command', func: 'pauseVideo', args: [] }),
        seek: (t) => send({ event: 'command', func: 'seekTo', args: [t, true] }),
      }
      : {
        play: () => send({ method: 'play' }),
        pause: () => send({ method: 'pause' }),
        seek: (t) => send({ method: 'setCurrentTime', value: t }),
      };
    if (goto) player.seek(goto);
    const open = doc.createElement('a');
    open.className = 'slipr-embed-open';
    open.href = el.querySelector('.slipr-embed-card-link')?.getAttribute('href') ?? src;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = `Watch on ${kind === 'youtube' ? 'YouTube' : 'Vimeo'} ↗`;
    live.replaceChildren(frame, ...(el.dataset.videoSlot === undefined ? [open] : []));
  }

  // Chapters (reader block), the chapter menu and transcript (reader slot), and search results.
  for (const button of /** @type {HTMLElement[]} */ ([...el.querySelectorAll('.slipr-video-chapter')])) {
    button.addEventListener('click', () => {
      player.seek(Number(button.dataset.videoTime) || 0);
      player.play();
    });
  }
  const menu = /** @type {HTMLSelectElement | null} */ (el.querySelector('.slipr-video-chapter-menu'));
  menu?.addEventListener('change', () => {
    if (menu.value === '') return;
    player.seek(Number(menu.value) || 0);
    player.play();
    menu.value = '';
  });
  const dialog = /** @type {HTMLDialogElement | null} */ (el.querySelector('.slipr-video-transcript-dialog'));
  el.querySelector('.slipr-video-transcript-open')?.addEventListener('click', () => dialog?.showModal());
  el.addEventListener('slipr:video-seek', (e) => {
    player.seek(Number(/** @type {CustomEvent} */ (e).detail) || 0);
  });

  if (el.dataset.videoMode !== 'audience' || el.dataset.videoSlot === undefined) return;

  // Audience mode: Reveal marks the current slide `present`; pause when it is
  // left, play on arrival with play "slide".
  const section = el.closest('section');
  if (section) {
    let present = section.classList.contains('present');
    new MutationObserver(() => {
      const now = section.classList.contains('present');
      if (now === present) return;
      present = now;
      if (!now) player.pause();
      else if (el.dataset.videoPlay === 'slide') {
        player.seek(start);
        player.play();
      }
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
    if (present && el.dataset.videoPlay === 'slide') player.play();
  }
  // Steps: Reveal shows the fragments one by one (class "visible").
  const steps = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-video-step')]);
  if (steps.length) {
    let shown = 0;
    const sync = () => {
      const visible = steps.filter((s) => s.classList.contains('visible'));
      if (visible.length === shown) return;
      const forward = visible.length > shown;
      shown = visible.length;
      const last = visible[visible.length - 1];
      if (!last) {
        player.pause();
        player.seek(start);
        return;
      }
      if (last.dataset.videoTime !== undefined) player.seek(Number(last.dataset.videoTime) || 0);
      else if (!forward) player.seek(start);
      player.play();
    };
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
}
