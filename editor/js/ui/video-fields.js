// @ts-check
/**
 * Fields for a video (I-110), shared by the `video` slot editor (Slide tab)
 * and the Video block editor (Reader tab): the video (choose a file to copy it
 * into the show's media/ folder, or type a path or a YouTube, Vimeo or video
 * file address), the title, start and end, playback options, what happens
 * while presenting (slots), chapters, the transcript, captions, click-to-load
 * and the poster. Value shapes come from video-values.js.
 */
import { h } from '../dom.js';
import { runImage } from './image-field.js';
import { fallbackImageField } from './web-fields.js';
import { addChapter, captionsValue, removeChapter, setChapter, timeFromText, timeText, videoSourceNote } from '../video-values.js';
import { videoSource } from '../../../shared/embeds/video.js';

/** Fields that are typed: their writes coalesce into one undo step and do not re-render the form. */
export const TYPED_VIDEO_FIELDS = new Set(['video', 'title', 'transcript', 'chapter-title', 'captions-src', 'captions-label', 'captions-lang', 'caption', 'fallback-alt']);

/**
 * @typedef {object} VideoFieldsOptions
 * @property {string} label  Accessible name prefix, e.g. "Video".
 * @property {'slot' | 'block'} kind
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(patch: Record<string, any>, field: string) => void} write  Patch the value; undefined removes a field.
 * @property {(file: File) => Promise<void>} addVideo  Copy a video into the show and make it the value's video.
 * @property {(file: File) => Promise<void>} addCaptions  Copy a .vtt file into the show and make it the captions.
 * @property {(file: File) => Promise<void>} addFallback  Copy an image into the show and make it the poster.
 * @property {(src: string) => string} [resolveAsset]
 */

/**
 * @param {VideoFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function videoFields(options) {
  const { label, kind, read, write } = options;
  const value = read() ?? {};
  const source = videoSource(String(value.video ?? ''));

  /** @param {string} accept @param {(file: File) => Promise<void>} add */
  const filePicker = (accept, add) => {
    const input = /** @type {HTMLInputElement} */ (h('input', {
      type: 'file',
      accept,
      hidden: true,
      onchange: () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) runImage(() => add(file));
      },
    }));
    return input;
  };
  const videoInput = filePicker('video/mp4,video/webm,.mp4,.webm,.m4v,.mov,.ogv', options.addVideo);
  const note = videoSourceNote(value.video);
  /** @param {string} name @param {boolean} checked @param {(on: boolean) => void} change */
  const checkbox = (name, checked, change) => h('label', {}, [
    h('input', { type: 'checkbox', checked, onchange: (/** @type {Event} */ e) => change(/** @type {HTMLInputElement} */ (e.target).checked) }),
    ` ${name}`,
  ]);
  /** @param {'start' | 'end'} which */
  const timeInput = (which) => h('input', {
    type: 'text',
    inputmode: 'decimal',
    class: 'slipr-input slipr-input-sm slipr-video-time',
    placeholder: which === 'start' ? '0:00' : 'end',
    value: timeText(value[which]),
    'aria-label': `${label}: ${which} time (seconds, or minutes:seconds)`,
    onchange: (/** @type {Event} */ e) => write({ [which]: timeFromText(/** @type {HTMLInputElement} */ (e.target).value) }, which),
  });

  /** @type {HTMLElement[]} */
  const fields = [
    h('div', { class: 'slipr-pdf-file' }, [
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-input-sm',
        placeholder: 'media/clip.mp4, or a YouTube or Vimeo link',
        'aria-label': `${label}: video file or address`,
        value: value.video ?? '',
        oninput: (/** @type {Event} */ e) => write({ video: /** @type {HTMLInputElement} */ (e.target).value }, 'video'),
      }),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => videoInput.click() }, ['Choose video…']),
      videoInput,
    ]),
    h('span', { class: `slipr-help ${note.level === 'info' ? '' : `is-${note.level}`}`, 'aria-live': 'polite' }, [note.message]),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Title (for screen readers, the card and search)',
      'aria-label': `${label}: title`,
      value: value.title ?? '',
      oninput: (/** @type {Event} */ e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        input.setAttribute('aria-invalid', input.value.trim() === '' ? 'true' : 'false');
        if (input.value.trim()) write({ title: input.value }, 'title');
      },
    }),
    h('div', { class: 'slipr-embed-height' }, [
      h('label', {}, ['Play from ', timeInput('start')]),
      h('label', {}, [' to ', timeInput('end')]),
    ]),
    h('span', { class: 'slipr-help' }, [source.kind === 'vimeo'
      ? 'Times as 90 or 1:30. Vimeo plays on after the end time.'
      : 'Times as 90 or 1:30. Empty: from the start, to the end.']),
    h('div', { class: 'slipr-form-checkbox slipr-video-options' }, [
      checkbox('Muted', value.muted === true, (on) => write({ muted: on || undefined }, 'muted')),
      checkbox('Loop', value.loop === true, (on) => write({ loop: on || undefined }, 'loop')),
      checkbox('Show controls', value.controls !== false, (on) => write({ controls: on ? undefined : false }, 'controls')),
    ]),
  ];

  if (kind === 'slot') {
    fields.push(
      h('div', { class: 'slipr-embed-height' }, [
        h('label', {}, [
          'While presenting ',
          h('select', {
            class: 'slipr-select slipr-select-sm',
            'aria-label': `${label}: when it plays while presenting`,
            onchange: (/** @type {Event} */ e) => write({ play: /** @type {HTMLSelectElement} */ (e.target).value || undefined }, 'play'),
          }, [
            h('option', { value: '', selected: !value.play || value.play === 'click' ? true : undefined }, ['play when I press play']),
            h('option', { value: 'slide', selected: value.play === 'slide' ? true : undefined }, ['play when the slide appears']),
            h('option', { value: 'step', selected: value.play === 'step' ? true : undefined }, ['play on the next click']),
          ]),
        ]),
        h('label', {}, [
          ' Show ',
          h('select', {
            class: 'slipr-select slipr-select-sm',
            'aria-label': `${label}: video or poster while presenting`,
            onchange: (/** @type {Event} */ e) => write({ present: /** @type {HTMLSelectElement} */ (e.target).value || undefined }, 'present'),
          }, [
            h('option', { value: '', selected: value.present !== 'static' ? true : undefined }, ['the video']),
            h('option', { value: 'static', selected: value.present === 'static' ? true : undefined }, ['the poster only']),
          ]),
        ]),
      ]),
      h('div', { class: 'slipr-form-checkbox' }, [
        checkbox('Each click jumps to the next chapter', value.chapterSteps === true, (on) => write({ chapterSteps: on || undefined }, 'chapterSteps')),
      ]),
    );
  }

  // Chapters: time and title per row.
  const chapters = Array.isArray(value.chapters) ? value.chapters : [];
  fields.push(h('fieldset', { class: 'slipr-video-chapters-editor' }, [
    h('legend', {}, ['Chapters']),
    ...chapters.map((/** @type {any} */ c, /** @type {number} */ i) => h('div', { class: 'slipr-video-chapter-row' }, [
      h('input', {
        type: 'text',
        inputmode: 'decimal',
        class: 'slipr-input slipr-input-sm slipr-video-time',
        value: timeText(c?.time),
        'aria-label': `${label}: chapter ${i + 1} time`,
        onchange: (/** @type {Event} */ e) => write({ chapters: setChapter(read()?.chapters, i, { time: /** @type {HTMLInputElement} */ (e.target).value }) }, 'chapter-time'),
      }),
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-input-sm',
        value: c?.title ?? '',
        'aria-label': `${label}: chapter ${i + 1} title`,
        oninput: (/** @type {Event} */ e) => write({ chapters: setChapter(read()?.chapters, i, { title: /** @type {HTMLInputElement} */ (e.target).value }) }, 'chapter-title'),
      }),
      h('button', {
        type: 'button',
        class: 'slipr-btn slipr-btn-sm slipr-btn-icon',
        title: 'Remove chapter',
        'aria-label': `Remove chapter ${i + 1}`,
        onclick: () => write({ chapters: removeChapter(read()?.chapters, i) }, 'chapters'),
      }, ['✕']),
    ])),
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => write({ chapters: addChapter(read()?.chapters) }, 'chapters') }, ['+ Chapter']),
    h('span', { class: 'slipr-help' }, [kind === 'slot'
      ? 'Readers can jump to a chapter, and search finds chapter titles. While presenting, chapters can be steps.'
      : 'Readers see the chapters below the video and can jump to one; search finds chapter titles.']),
  ]));

  fields.push(h('label', { class: 'slipr-video-transcript-editor' }, [
    'Transcript (Markdown)',
    h('textarea', {
      class: 'slipr-textarea slipr-textarea-sm',
      placeholder: 'What is said in the video. Readers can open it; search finds it.',
      'aria-label': `${label}: transcript`,
      oninput: (/** @type {Event} */ e) => write({ transcript: /** @type {HTMLTextAreaElement} */ (e.target).value || undefined }, 'transcript'),
    }, [value.transcript ?? '']),
  ]));

  if (kind === 'block') {
    fields.push(h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm',
      placeholder: 'Caption (optional)',
      'aria-label': `${label}: caption`,
      value: value.caption ?? '',
      oninput: (/** @type {Event} */ e) => write({ caption: /** @type {HTMLInputElement} */ (e.target).value || undefined }, 'caption'),
    }));
  }

  if (source.kind === 'file') {
    // Captions: a WebVTT file in the show folder (YouTube and Vimeo bring their own).
    const captions = value.captions ?? {};
    const captionsInput = filePicker('text/vtt,.vtt', options.addCaptions);
    /** @param {'src' | 'label' | 'lang'} part @param {string} text */
    const writeCaptions = (part, text) => {
      const now = read()?.captions ?? {};
      const next = { src: now.src ?? '', label: now.label ?? '', lang: now.lang ?? '', [part]: text };
      write({ captions: captionsValue(next.src, next.label, next.lang) }, `captions-${part}`);
    };
    fields.push(h('div', { class: 'slipr-video-captions-editor' }, [
      h('div', { class: 'slipr-pdf-file' }, [
        h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm',
          placeholder: 'Captions: media/clip.en.vtt',
          'aria-label': `${label}: captions file`,
          value: captions.src ?? '',
          oninput: (/** @type {Event} */ e) => writeCaptions('src', /** @type {HTMLInputElement} */ (e.target).value),
        }),
        h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => captionsInput.click() }, ['Choose .vtt…']),
        captionsInput,
      ]),
      h('div', { class: 'slipr-embed-height' }, [
        h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm',
          placeholder: 'Label, e.g. English',
          'aria-label': `${label}: captions label`,
          value: captions.label ?? '',
          disabled: captions.src ? undefined : true,
          oninput: (/** @type {Event} */ e) => writeCaptions('label', /** @type {HTMLInputElement} */ (e.target).value),
        }),
        h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm slipr-video-lang',
          placeholder: 'en',
          'aria-label': `${label}: captions language code`,
          value: captions.lang ?? '',
          disabled: captions.src ? undefined : true,
          oninput: (/** @type {Event} */ e) => writeCaptions('lang', /** @type {HTMLInputElement} */ (e.target).value),
        }),
      ]),
    ]));
  }

  if (source.origin) {
    fields.push(h('div', { class: 'slipr-form-checkbox' }, [
      checkbox('In reader mode, load straight away without asking', value.load === 'auto', (on) => write({ load: on ? 'auto' : undefined }, 'load')),
    ]));
  }

  fields.push(fallbackImageField({ ...options, label: `${label} poster` }, 'Optional: a poster image, shown before the video plays, in print and in thumbnails.'));
  return fields;
}
