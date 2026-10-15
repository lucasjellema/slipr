// Video values in the editor (I-110).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addChapter, captionsValue, isVideoSiteUrl, removeChapter, setChapter, timeFromText, timeText,
  videoSourceNote, videoSummary, videoValue,
} from '../js/video-values.js';
import { isCaptionsFile, isVideoFile, mediaPath } from '../js/io/images.js';
import { withFallback } from '../js/block-values.js';
import { slotEditorKind } from '../js/slot-values.js';
import { serializeShow } from '../js/io/serialize.js';

describe('video values (I-110)', () => {
  test('videoValue keeps video and a title; empty fields are removed', () => {
    assert.deepEqual(videoValue(undefined, {}), { video: '', title: 'Video' });
    const v = videoValue({ video: 'a.mp4', title: 'A', muted: true }, { title: '  ', muted: undefined, start: 5, transcript: '' });
    assert.deepEqual(v, { video: 'a.mp4', title: 'A', start: 5 });
    assert.deepEqual(withFallback(v, { src: 'p.png', alt: 'P' }), { video: 'a.mp4', title: 'A', start: 5, fallback: { src: 'p.png', alt: 'P' } });
  });

  test('the note under the address names the source or the problem', () => {
    assert.equal(videoSourceNote('').level, 'error');
    assert.equal(videoSourceNote('javascript:x').level, 'error');
    assert.match(videoSourceNote('https://youtu.be/aqz-KE-bpKQ').message, /^YouTube video aqz-KE-bpKQ/);
    assert.match(videoSourceNote('https://vimeo.com/76979871').message, /^Vimeo video 76979871/);
    assert.match(videoSourceNote('media/a.mp4').message, /show folder/);
    assert.equal(videoSourceNote('https://example.org/page').level, 'warning');
    assert.equal(videoSourceNote('https://example.org/a.webm').level, 'info');
    assert.equal(isVideoSiteUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ'), true);
    assert.equal(isVideoSiteUrl('https://example.org'), false);
  });

  test('times as typed and shown', () => {
    assert.equal(timeFromText('1:30'), 90);
    assert.equal(timeFromText('90'), 90);
    assert.equal(timeFromText(''), undefined);
    assert.equal(timeFromText('later'), undefined);
    assert.equal(timeText(90), '1:30');
    assert.equal(timeText(12.5), '0:12.5');
    assert.equal(timeText(undefined), '');
  });

  test('chapters: add a minute after the last, edit, remove', () => {
    const one = addChapter(undefined);
    assert.deepEqual(one, [{ time: 0, title: 'Chapter 1' }]);
    const two = addChapter([{ time: 30, title: 'A' }]);
    assert.deepEqual(two[1], { time: 90, title: 'Chapter 2' });
    assert.deepEqual(setChapter(two, 1, { time: '2:00', title: 'B' })[1], { time: 120, title: 'B' });
    assert.deepEqual(setChapter(two, 1, { time: 'soon' })[1], { time: 90, title: 'Chapter 2' }, 'unreadable time is ignored');
    assert.deepEqual(removeChapter(two, 0), [{ time: 90, title: 'Chapter 2' }]);
    assert.equal(removeChapter(one, 0), undefined);
  });

  test('captions and the summary', () => {
    assert.equal(captionsValue(''), undefined);
    assert.deepEqual(captionsValue('media/a.vtt', ' English ', ''), { src: 'media/a.vtt', label: 'English' });
    assert.equal(videoSummary({ video: 'https://youtu.be/aqz-KE-bpKQ', title: 'Bunny', chapters: [{ time: 0, title: 'A' }] }), 'Bunny: YouTube aqz-KE-bpKQ, 1 chapter');
    assert.equal(videoSummary({ video: '', title: 'Video' }), 'Video: (no video yet)');
  });

  test('media file names and types', async () => {
    const bytes = new TextEncoder().encode('fake video');
    assert.match(await mediaPath({ name: 'My Clip.MP4', type: 'video/mp4', bytes }), /^media\/my-clip-[0-9a-f]{8}\.mp4$/);
    assert.match(await mediaPath({ name: '', type: 'video/webm', bytes }, 'intro'), /^media\/intro-[0-9a-f]{8}\.webm$/);
    assert.match(await mediaPath({ name: 'clip.en.vtt', type: 'text/vtt', bytes }), /^media\/clip-en-[0-9a-f]{8}\.vtt$/);
    assert.equal(isVideoFile({ name: 'a.webm' }), true);
    assert.equal(isVideoFile({ name: 'a.avi', type: '' }), false);
    assert.equal(isCaptionsFile({ name: 'a.vtt' }), true);
    assert.equal(isCaptionsFile({ name: 'a.srt' }), false);
  });

  test('the slide form edits video slots; saved keys follow the schema order', () => {
    assert.equal(slotEditorKind('video', undefined), 'video');
    const show = {
      slipr: '0.2', id: 'x', meta: { title: 'X' }, template: { ref: '../t' },
      slides: [{ id: 's', layout: 'video', content: { video: { fallback: { alt: 'P', src: 'p.png' }, chapters: [{ title: 'A', time: 0 }], title: 'T', video: 'a.mp4', play: 'step' } } }],
    };
    const saved = JSON.parse(serializeShow(show));
    assert.deepEqual(Object.keys(saved.slides[0].content.video), ['video', 'title', 'play', 'chapters', 'fallback']);
    assert.deepEqual(Object.keys(saved.slides[0].content.video.chapters[0]), ['time', 'title']);
    assert.deepEqual(Object.keys(saved.slides[0].content.video.fallback), ['src', 'alt']);
  });
});
