// Videos (I-110): sources, times, markup, validation, search and export.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  EXPORT_VIDEO_LIMIT, afterHtml, attributes, formatTime, isVideo, looksLikeVideoFile, parseTime,
  playRange, staticHtml, videoChapters, videoEntries, videoFiles, videoSource, videoUrl, watchUrl,
} from '../embeds/video.js';
import { embedKindForBlock, embedKindForSlot, usedEmbedKinds } from '../embeds/index.js';
import { renderBlock } from '../blocks.js';
import { validateShow } from '../validate.js';
import { packShow } from '../export/single-file.js';
import { buildSearchIndex } from '../../viewer/reader/search-index.js';
import { clone, codes, exists, readJson, repoRoot } from './helpers.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const ctx = { resolveAsset: (/** @type {string} */ src) => `/shows/demo/${src}` };

/** Validate the demo with its video slot changed. @param {(video: any) => void} change @param {string} [version] */
const withVideo = (change, version = '0.2') => {
  const show = clone(demo);
  show.slipr = version;
  change(show.slides.find((/** @type {any} */ s) => s.id === 's-video').content.video);
  return validateShow(show, { template, imageExists: (src) => exists(`shows/demo/${src}`) });
};

describe('video sources (I-110)', () => {
  test('YouTube links in every form', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtube.com/watch?v=aqz-KE-bpKQ&list=x',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube.com/live/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    ]) {
      const source = videoSource(url);
      assert.equal(source.kind, 'youtube', url);
      assert.equal(source.id, 'aqz-KE-bpKQ', url);
      assert.equal(source.origin, 'https://www.youtube-nocookie.com');
    }
    assert.equal(videoSource('https://youtu.be/aqz-KE-bpKQ?t=90').start, 90);
    assert.equal(videoSource('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s').start, 90);
    assert.equal(videoSource('https://www.youtube.com/watch?v=short').kind, 'file');
  });

  test('Vimeo links, with the hash of an unlisted video', () => {
    assert.deepEqual(videoSource('https://vimeo.com/76979871'), { kind: 'vimeo', id: '76979871', origin: 'https://player.vimeo.com', label: 'Vimeo' });
    assert.equal(videoSource('https://vimeo.com/76979871/abcdef1234').hash, 'abcdef1234');
    assert.equal(videoSource('https://player.vimeo.com/video/76979871?h=abcdef1234').hash, 'abcdef1234');
    assert.equal(videoSource('https://vimeo.com/channels/staffpicks/76979871').id, '76979871');
  });

  test('files in the show folder and on other servers', () => {
    assert.deepEqual(videoSource('media/clip.mp4'), { kind: 'file', origin: null, label: 'File in this show' });
    assert.deepEqual(videoSource('https://cdn.example.org/a.mp4'), { kind: 'file', origin: 'https://cdn.example.org', label: 'cdn.example.org' });
    assert.equal(looksLikeVideoFile('https://cdn.example.org/a.MP4?x=1'), true);
    assert.equal(looksLikeVideoFile('https://example.org/watch'), false);
  });

  test('times: parse and format', () => {
    assert.equal(parseTime(12.5), 12.5);
    assert.equal(parseTime('90'), 90);
    assert.equal(parseTime('1:30'), 90);
    assert.equal(parseTime('1:02:03'), 3723);
    assert.equal(parseTime('2m5s'), 125);
    assert.equal(parseTime('soon'), null);
    assert.equal(parseTime(-1), null);
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(754), '12:34');
    assert.equal(formatTime(3723), '1:02:03');
  });

  test('play range and chapters', () => {
    assert.deepEqual(playRange({ video: 'a.mp4', start: 5, end: 3 }), [5, null]);
    assert.deepEqual(playRange({ video: 'https://youtu.be/aqz-KE-bpKQ?t=20' }), [20, null]);
    assert.deepEqual(playRange({ video: 'https://youtu.be/aqz-KE-bpKQ?t=20', start: 2, end: 9 }), [2, 9]);
    assert.deepEqual(videoChapters({ chapters: [{ time: 30, title: 'B' }, { time: 0, title: 'A' }, { time: 5 }] }), [{ time: 0, title: 'A' }, { time: 30, title: 'B' }]);
  });
});

describe('video markup (I-110)', () => {
  test('player addresses: privacy-friendly embeds with the options', () => {
    const yt = videoUrl({ video: 'https://youtu.be/aqz-KE-bpKQ', start: 10, end: 20.2, muted: true, loop: true, controls: false }, ctx);
    const u = new URL(yt);
    assert.equal(u.origin + u.pathname, 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
    assert.deepEqual(Object.fromEntries(u.searchParams), { rel: '0', enablejsapi: '1', playsinline: '1', start: '10', end: '21', mute: '1', loop: '1', playlist: 'aqz-KE-bpKQ', controls: '0' });
    assert.equal(videoUrl({ video: 'https://vimeo.com/76979871/abcdef1234', start: 65 }, ctx), 'https://player.vimeo.com/video/76979871?dnt=1&h=abcdef1234#t=65s');
    assert.equal(videoUrl({ video: 'media/clip.mp4' }, ctx), '/shows/demo/media/clip.mp4');
    assert.equal(watchUrl({ video: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ' }, ctx), 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  });

  test('attributes: click-to-load in reader mode, never in audience mode; static presenting', () => {
    const yt = { video: 'https://youtu.be/aqz-KE-bpKQ', title: 'Bunny' };
    assert.equal(attributes(yt, ctx)['data-embed-origin'], 'https://www.youtube-nocookie.com');
    assert.equal(attributes({ ...yt, load: 'auto' }, ctx)['data-embed-origin'], undefined);
    assert.equal(attributes(yt, ctx, { mode: 'audience', slot: true })['data-embed-origin'], undefined);
    assert.equal(attributes({ ...yt, present: 'static' }, ctx, { mode: 'audience', slot: true })['data-embed-static'], '');
    assert.equal(attributes({ ...yt, play: 'slide' }, ctx, { mode: 'audience', slot: true })['data-video-play'], 'slide');
    const local = attributes({ video: 'media/clip.mp4', title: 'Clip', captions: { src: 'media/clip.vtt', lang: 'nl' }, fallback: { src: 'media/p.png', alt: '' } }, ctx);
    assert.equal(local['data-embed-origin'], undefined);
    assert.equal(local['data-video-captions'], '/shows/demo/media/clip.vtt');
    assert.equal(local['data-video-captions-label'], 'nl');
    assert.equal(local['data-video-poster'], '/shows/demo/media/p.png');
    assert.equal(attributes({ ...yt, captions: { src: 'x.vtt' } }, ctx)['data-video-captions'], undefined);
  });

  test('the card names the source; steps, chapter lists and the slot bar', () => {
    const card = staticHtml({ video: 'https://youtu.be/aqz-KE-bpKQ', title: 'A <b>', start: 70 }, ctx).html;
    assert.match(card, /▶ A &lt;b&gt;/);
    assert.match(card, /Video from 1:10 · YouTube/);
    assert.match(card, /href="https:\/\/www\.youtube\.com\/watch\?v=aqz-KE-bpKQ"/);
    const value = { video: 'a.mp4', title: 'T', play: 'step', chapterSteps: true, chapters: [{ time: 0, title: 'One' }, { time: 4, title: 'Two' }, { time: 9, title: 'Three' }], transcript: 'Hello **world**' };
    const steps = afterHtml(value, { mode: 'audience', slot: true });
    assert.equal((steps.match(/class="fragment slipr-video-step"/g) ?? []).length, 3);
    assert.match(steps, /data-video-action="play"[\s\S]*data-video-time="4"[\s\S]*data-video-time="9"/);
    assert.equal(afterHtml({ ...value, present: 'static' }, { mode: 'audience', slot: true }), '');
    const block = afterHtml(value);
    assert.match(block, /<button type="button" class="slipr-video-chapter" data-video-time="4"><span class="slipr-video-chapter-time">0:04<\/span>/);
    assert.match(block, /<details class="slipr-video-transcript"><summary>Transcript<\/summary><p>Hello <strong>world<\/strong><\/p>/);
    const bar = afterHtml(value, { slot: true });
    assert.match(bar, /<select class="slipr-video-chapter-menu"/);
    assert.match(bar, /<dialog class="slipr-video-transcript-dialog"/);
    assert.equal(afterHtml({ video: 'a.mp4', title: 'T' }, { slot: true }), '');
  });

  test('registry, block rendering and the show helpers', () => {
    assert.equal(embedKindForSlot('video'), 'video');
    assert.equal(embedKindForBlock('video'), 'video');
    assert.ok(usedEmbedKinds(demo).has('video'));
    const html = renderBlock({ id: 'v', type: 'video', video: 'javascript:alert(1)', title: 'x' }, 's', { show: demo, resolveAsset: (s) => s });
    assert.match(html, /\[video blocked: unsupported URL\]/);
    const ok = renderBlock({ id: 'v', type: 'video', video: 'media/a.mp4', title: 'Clip', caption: 'Cap' }, 's', { show: demo, resolveAsset: (s) => s });
    assert.match(ok, /<p class="slipr-block-title">Clip<\/p><figure class="slipr-figure slipr-figure--video"><div class="slipr-embed slipr-embed--video"/);
    assert.match(ok, /<figcaption class="slipr-caption">Cap<\/figcaption>/);
    assert.deepEqual(videoEntries(demo).map((e) => e.blockId), ['slot:video', 'video-clip', 'video-youtube']);
    assert.deepEqual(videoFiles({ video: 'media/a.mp4', captions: { src: 'media/a.vtt' } }), ['media/a.mp4', 'media/a.vtt']);
    assert.deepEqual(videoFiles({ video: 'https://youtu.be/aqz-KE-bpKQ', captions: { src: 'media/a.vtt' } }), []);
    assert.equal(isVideo({ video: 'a.mp4' }), true);
    assert.equal(isVideo({ src: 'a.mp4' }), false);
  });
});

describe('video validation (I-110)', () => {
  test('the demo video slide is valid without warnings; a video in a 0.1 show is an error', () => {
    const result = withVideo(() => {});
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.ok(codes(withVideo(() => {}, '0.1').errors).includes('format-version'));
  });

  test('addresses', () => {
    assert.ok(codes(withVideo((v) => { v.video = 'javascript:alert(1)'; }).errors).includes('unsafe-url'));
    assert.ok(codes(withVideo((v) => { v.video = 'ftp://example.org/a.mp4'; }).errors).includes('unsafe-url'));
    assert.ok(codes(withVideo((v) => { v.video = 'media/gone.mp4'; }).warnings).includes('missing-file'));
    const page = withVideo((v) => { v.video = 'https://example.org/some-page'; delete v.captions; });
    assert.deepEqual(codes(page.warnings), ['video-not-a-file']);
    assert.deepEqual(withVideo((v) => { v.video = 'https://example.org/a.webm'; delete v.captions; }).warnings, []);
  });

  test('captions, times, chapters and steps', () => {
    assert.ok(codes(withVideo((v) => { v.captions.src = 'media/clip.srt'; }).errors).includes('video-captions'));
    assert.ok(codes(withVideo((v) => { v.captions.src = 'https://example.org/a.vtt'; }).errors).includes('video-captions'));
    assert.ok(codes(withVideo((v) => { v.video = 'https://youtu.be/aqz-KE-bpKQ'; }).warnings).includes('video-captions-ignored'));
    assert.ok(codes(withVideo((v) => { v.start = 5; v.end = 2; }).warnings).includes('video-end-before-start'));
    assert.ok(codes(withVideo((v) => { v.chapters.reverse(); }).warnings).includes('video-chapters-order'));
    assert.equal(withVideo((v) => { v.chapters.push({ time: 1 }); }).ok, false);
    assert.ok(codes(withVideo((v) => { delete v.chapters; }).warnings).includes('video-steps-without-chapters'));
    assert.ok(codes(withVideo((v) => { v.present = 'static'; delete v.fallback; }).warnings).includes('static-without-fallback'));
    assert.equal(withVideo((v) => { v.play = 'later'; }).ok, false);
  });
});

describe('video search and export (I-110)', () => {
  test('search finds chapters and the transcript; a chapter result has its time', () => {
    const docs = buildSearchIndex(demo);
    const chapter = docs.find((d) => d.blockId === 'video-clip' && d.time === 3);
    assert.ok(chapter);
    assert.match(chapter.title, /› The clip, with chapters and a transcript › 0:03 The reader layer$/);
    assert.ok(docs.some((d) => d.blockId === 'slot:video' && d.time === 6));
    const slide = docs.find((d) => d.kind === 'slide' && d.slideId === 's-video');
    assert.match(slide?.fields.find((f) => f.name === 'content')?.text ?? '', /tailored to them/);
  });

  test('the single-file export packs video files up to the limit', async () => {
    const readRepo = async (/** @type {string} */ path) => {
      try {
        return new Uint8Array(await readFile(resolve(repoRoot, path)));
      } catch {
        return null;
      }
    };
    const packed = await packShow({ readFile: readRepo, showDir: 'shows/demo' });
    assert.ok(packed.files.includes('show/media/slipr-clip.webm'));
    assert.ok(packed.files.includes('show/media/slipr-clip.en.vtt'));
    const big = await packShow({
      readFile: async (path) => (path.endsWith('.webm') ? new Uint8Array(EXPORT_VIDEO_LIMIT + 1) : readRepo(path)),
      showDir: 'shows/demo',
    });
    assert.ok(!big.files.includes('show/media/slipr-clip.webm'));
    assert.ok(big.files.includes('show/media/slipr-clip-poster.png'));
    assert.ok(big.warnings.some((w) => w.includes('slipr-clip.webm') && w.includes('25 MB limit')));
  });
});
