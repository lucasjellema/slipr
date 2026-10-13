// @ts-check
/**
 * The look of a text element (D-016, I-089): font and size, bold / italic /
 * underline / uppercase, alignment, text color, fill with opacity, and (folded
 * away) border, corner radius, text outline and padding.
 *
 * Palette first: every color offers the template's colors
 * (`styleguide.colors`) as swatches before a free color picker, and fonts and
 * sizes are the template's unless the author picks otherwise.
 *
 * Every control stores on `change` (release, close, Enter), not per keystroke,
 * so a form re-render never replaces a control in the middle of an edit.
 */
import { h } from '../dom.js';
import { isHexColor, TEXT_STYLE_RANGES } from '../../../shared/text-style.js';

const FONTS = [
  ['body', 'Body font (template)'],
  ['heading', 'Heading font (template)'],
  ['mono', 'Code font (template)'],
  ['system', 'System font'],
  ['serif', 'Serif font'],
];
const SIZES = [['small', 'Small'], ['body', 'Body'], ['subtitle', 'Subtitle'], ['title', 'Title'], ['hero', 'Hero']];

/**
 * @param {{ id: string, label: string, style: any, palette: Record<string, string>,
 *   onChange: (patch: Record<string, any>) => void }} options
 *   `id` makes the control ids unique; `onChange` gets the changed fields
 *   (undefined = back to the default).
 * @returns {HTMLElement}
 */
export function textStyleControls({ id, label, style, palette, onChange }) {
  const s = style && typeof style === 'object' ? style : {};
  const colors = Object.entries(palette ?? {}).filter(([, v]) => isHexColor(v));
  const sizeIsNumber = typeof s.size === 'number';

  /** A labelled select. @param {string} key @param {string} text @param {string[][]} options @param {string} value */
  const select = (key, text, options, value, /** @type {(v: string) => void} */ onPick) => h('label', { class: 'slipr-text-style-field' }, [
    h('span', { class: 'slipr-label' }, [text]),
    h('select', {
      id: `${id}-${key}`,
      class: 'slipr-select',
      onchange: (/** @type {Event} */ e) => onPick(/** @type {HTMLSelectElement} */ (e.target).value),
    }, options.map(([v, t]) => h('option', { value: v, selected: v === value ? true : undefined }, [t]))),
  ]);

  /** A number field within its range; empty = the default. @param {keyof typeof TEXT_STYLE_RANGES} key @param {string} text @param {number} step */
  const number = (key, text, step, /** @type {string} */ title) => {
    const [min, max] = TEXT_STYLE_RANGES[key];
    return h('label', { class: 'slipr-text-style-field slipr-text-style-number', title }, [
      h('span', { class: 'slipr-label' }, [text]),
      h('input', {
        id: `${id}-${key}`,
        type: 'number', class: 'slipr-input', min: String(min), max: String(max), step: String(step),
        value: typeof s[key] === 'number' ? String(s[key]) : '',
        placeholder: key === 'size' ? '' : '0',
        onchange: (/** @type {Event} */ e) => {
          const raw = /** @type {HTMLInputElement} */ (e.target).value;
          onChange({ [key]: raw === '' ? undefined : Number(raw) });
        },
      }),
    ]);
  };

  /** A toggle button. @param {string} key @param {string} text @param {string} title */
  const toggle = (key, text, title) => h('button', {
    type: 'button',
    class: `slipr-item-btn slipr-text-style-toggle is-${key} ${s[key] === true ? 'is-selected' : ''}`,
    'aria-pressed': s[key] === true ? 'true' : 'false',
    title, 'aria-label': `${label}: ${title}`,
    onclick: () => onChange({ [key]: s[key] === true ? undefined : true }),
  }, [text]);

  /** One of a few values, as pressed buttons. @param {string} key @param {[string, string, string][]} options [value, text, title] @param {string} fallback */
  const choice = (key, options, fallback) => h('span', { class: 'slipr-text-style-choice', role: 'group', 'aria-label': `${label}: ${key === 'align' ? 'alignment' : 'vertical alignment'}` },
    options.map(([v, text, title]) => {
      const on = (s[key] ?? fallback) === v;
      return h('button', {
        type: 'button', class: `slipr-item-btn ${on ? 'is-selected' : ''}`, 'aria-pressed': on ? 'true' : 'false', title,
        onclick: () => { if (!on) onChange({ [key]: v === fallback ? undefined : v }); },
      }, [text]);
    }));

  /**
   * Swatches (a "none" option and the template's colors) and a free color picker.
   * @param {string} key @param {string} text @param {string} noneLabel
   */
  const color = (key, text, noneLabel) => {
    const value = isHexColor(s[key]) ? s[key] : '';
    /** @param {string} v @param {string} name */
    const swatch = (v, name) => {
      const on = v.toLowerCase() === value.toLowerCase();
      return h('button', {
        type: 'button',
        class: `slipr-swatch ${v ? '' : 'is-none'} ${on ? 'is-selected' : ''}`,
        style: v ? `background-color: ${v}` : undefined,
        'aria-pressed': on ? 'true' : 'false',
        title: v ? `${name} (${v})` : noneLabel,
        'aria-label': `${label}: ${text.toLowerCase()} ${v ? name : noneLabel}`,
        onclick: () => { if (!on) onChange({ [key]: v || undefined }); },
      });
    };
    return h('div', { class: 'slipr-text-style-color', role: 'group', 'aria-label': `${label}: ${text.toLowerCase()}` }, [
      h('span', { class: 'slipr-label' }, [text]),
      h('span', { class: 'slipr-swatches' }, [
        swatch('', noneLabel),
        ...colors.map(([name, v]) => swatch(v, name)),
        h('input', {
          id: `${id}-${key}`,
          type: 'color', class: 'slipr-color-input',
          value: value ? expandHex(value) : '#000000',
          title: 'Another color', 'aria-label': `${label}: ${text.toLowerCase()}, another color`,
          onchange: (/** @type {Event} */ e) => onChange({ [key]: /** @type {HTMLInputElement} */ (e.target).value }),
        }),
      ]),
    ]);
  };

  const opacity = Math.round((typeof s.backgroundOpacity === 'number' ? s.backgroundOpacity : 1) * 100);
  const readout = h('span', { class: 'slipr-picture-opacity-value' }, [`${opacity}%`]);
  const slider = /** @type {HTMLInputElement} */ (h('input', {
    type: 'range', min: '0', max: '100', step: '5', value: String(opacity),
    class: 'slipr-picture-opacity',
    disabled: isHexColor(s.background) ? undefined : true,
    'aria-label': `${label}: fill opacity`, 'aria-valuetext': `${opacity}%`,
    oninput: () => { readout.textContent = `${slider.value}%`; slider.setAttribute('aria-valuetext', `${slider.value}%`); },
    onchange: () => {
      const v = Number(slider.value);
      onChange({ backgroundOpacity: v >= 100 ? undefined : v / 100 });
    },
  }));

  const hasBox = ['borderWidth', 'radius', 'outlineWidth', 'padding'].some((k) => typeof s[k] === 'number' && s[k] > 0);

  return h('div', { class: 'slipr-text-style', role: 'group', 'aria-label': `${label}: look` }, [
    h('div', { class: 'slipr-text-style-row' }, [
      select('font', 'Font', FONTS, typeof s.font === 'string' ? s.font : 'body', (v) => onChange({ font: v === 'body' ? undefined : v })),
      select('size-preset', 'Size', [...SIZES, ['custom', 'Custom…']], sizeIsNumber ? 'custom' : typeof s.size === 'string' ? s.size : 'body', (v) => {
        if (v === 'custom') onChange({ size: 2 });
        else onChange({ size: v === 'body' ? undefined : v });
      }),
      sizeIsNumber ? number('size', '% of width', 0.1, 'Font size as a percentage of the slide width') : null,
    ]),
    h('div', { class: 'slipr-text-style-row' }, [
      toggle('bold', 'B', 'Bold'),
      toggle('italic', 'I', 'Italic'),
      toggle('underline', 'U', 'Underline'),
      toggle('uppercase', 'AA', 'Uppercase'),
      choice('align', [['left', '⇤', 'Align left'], ['center', '↔', 'Center'], ['right', '⇥', 'Align right']], 'left'),
      choice('valign', [['top', '⤒', 'Top'], ['middle', '↕', 'Middle'], ['bottom', '⤓', 'Bottom']], 'top'),
    ]),
    color('color', 'Text color', 'The template\'s text color'),
    color('background', 'Fill', 'No fill'),
    h('label', { class: 'slipr-picture-opacity-row' }, [h('span', { class: 'slipr-label' }, ['Fill opacity']), slider, readout]),
    h('details', { class: 'slipr-text-style-more', open: hasBox ? true : undefined }, [
      h('summary', {}, ['Border, outline and padding']),
      h('div', { class: 'slipr-text-style-row' }, [
        number('borderWidth', 'Border', 0.05, 'Border width, percentage of the slide width'),
        select('borderStyle', 'Style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], typeof s.borderStyle === 'string' ? s.borderStyle : 'solid',
          (v) => onChange({ borderStyle: v === 'solid' ? undefined : v })),
        number('radius', 'Corners', 0.1, 'Corner radius, percentage of the slide width; large values make a pill'),
        number('padding', 'Padding', 0.1, 'Space around the text, percentage of the slide width'),
      ]),
      color('borderColor', 'Border color', 'The text color'),
      h('div', { class: 'slipr-text-style-row' }, [
        number('outlineWidth', 'Text outline', 0.05, 'A halo around the letters, for text over photos; percentage of the slide width'),
      ]),
      color('outlineColor', 'Outline color', 'White'),
    ]),
  ]);
}

/** #rgb → #rrggbb (the color input needs six digits). @param {string} hex */
function expandHex(hex) {
  return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
}
