// @ts-check
/**
 * Picture style and opacity for an image (D-014, I-084): a row of buttons,
 * "None" plus one per picture style of the template, each showing this
 * picture in that style; and an opacity slider. Used by image slots, card
 * images, reader image blocks and extra images.
 *
 * The template's theme.css is loaded in the editor page, and its
 * `.slipr-picture-<id>` classes are not scoped to slides, so the previews
 * show the real styles.
 */
import { h } from '../dom.js';

/**
 * @param {{ label: string, image: any, styles: { id: string, label: string, description?: string }[],
 *   resolveAsset?: (src: string) => string,
 *   onChange: (patch: { style?: string | undefined, opacity?: number | undefined }) => void }} options
 *   `onChange` gets `undefined` for "no style" and for 100 % opacity, so the key is removed.
 * @returns {HTMLElement | null}  Nothing until the image has a picture.
 */
export function pictureStyleControls({ label, image, styles, resolveAsset, onChange }) {
  if (!image?.src) return null;
  const src = resolveAsset?.(image.src) ?? image.src;
  const current = typeof image.style === 'string' ? image.style : '';
  const known = styles.some((s) => s.id === current);
  const percent = Math.round((typeof image.opacity === 'number' ? image.opacity : 1) * 100);

  /** @param {string} id @param {string} text @param {string} [title] */
  const option = (id, text, title) => h('button', {
    type: 'button',
    class: `slipr-picture-option ${id === current ? 'is-selected' : ''}`,
    'aria-pressed': id === current ? 'true' : 'false',
    title: title ?? text,
    onclick: () => { if (id !== current) onChange({ style: id || undefined }); },
  }, [
    h('span', { class: 'slipr-picture-option-frame' }, [
      h('img', { src, alt: '', class: id ? `slipr-picture-${id}` : '', draggable: 'false' }),
    ]),
    h('span', { class: 'slipr-picture-option-label' }, [text]),
  ]);

  const readout = h('span', { class: 'slipr-picture-opacity-value' }, [`${percent}%`]);
  const slider = /** @type {HTMLInputElement} */ (h('input', {
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(percent),
    class: 'slipr-picture-opacity',
    'aria-label': `${label}: opacity`,
    'aria-valuetext': `${percent}%`,
    // Live readout while dragging; store on release (or per arrow key), so a
    // form re-render never replaces the slider in the middle of a drag.
    oninput: () => { readout.textContent = `${slider.value}%`; slider.setAttribute('aria-valuetext', `${slider.value}%`); },
    onchange: () => {
      const v = Number(slider.value);
      onChange({ opacity: v >= 100 ? undefined : v / 100 });
    },
  }));

  return h('div', { class: 'slipr-picture-style', role: 'group', 'aria-label': `${label}: picture style` }, [
    styles.length
      ? h('div', { class: 'slipr-picture-options' }, [
          option('', 'None', 'No picture style'),
          ...styles.map((s) => option(s.id, s.label, s.description)),
        ])
      : null,
    current && !known
      ? h('p', { class: 'slipr-help slipr-picture-unknown' }, [`The template has no picture style "${current}", so the picture is shown without it. `,
          h('button', { type: 'button', class: 'slipr-link-btn', onclick: () => onChange({ style: undefined }) }, ['Remove it']),
        ])
      : null,
    h('label', { class: 'slipr-picture-opacity-row' }, [
      h('span', { class: 'slipr-label' }, ['Opacity']),
      slider,
      readout,
    ]),
  ]);
}
