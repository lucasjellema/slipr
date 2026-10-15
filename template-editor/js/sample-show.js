// @ts-check
/**
 * Sample content for the template editor's preview (I-106). DOM-free.
 *
 * - `generatedSample(template)`: one slide per layout, every slot filled with
 *   placeholder content of its type, and reader blocks of every simple kind.
 * - `fitSample(show, template)`: a Slipr sample show, cut to the slides whose
 *   layout the template has.
 */

/** The Slipr sample shows the preview can use, relative to the app folder. */
export const SAMPLE_SHOWS = [
  { id: 'demo', label: 'Demo show', url: '../shows/demo/show.json' },
  { id: 'conclusion-demo', label: 'Conclusion demo', url: '../shows/conclusion-demo/show.json' },
];

/**
 * A placeholder picture: a soft diagonal gradient with a few shapes, as an
 * SVG data URL (no file, no network).
 * @param {number} n  Varies the colours.
 * @returns {string}
 */
export function placeholderImage(n = 0) {
  const hues = [[205, 160], [28, 350], [140, 95], [265, 215]][n % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hues[0]} 45% 62%)"/><stop offset="1" stop-color="hsl(${hues[1]} 40% 32%)"/></linearGradient></defs>`
    + `<rect width="800" height="500" fill="url(#g)"/>`
    + `<circle cx="590" cy="170" r="70" fill="hsl(${hues[0]} 70% 88%)" opacity="0.8"/>`
    + `<path d="M0 420 L210 250 L360 360 L520 220 L800 430 L800 500 L0 500 Z" fill="hsl(${hues[1]} 35% 22%)" opacity="0.7"/>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const TEXT_SAMPLES = /** @type {Record<string, string>} */ ({
  title: 'Quiet mornings',
  subtitle: 'Why we keep meetings out of the morning',
  byline: 'Team Delta · October 2026',
  kicker: 'Chapter 2',
  caption: 'The library corner on the second floor',
});

/**
 * A placeholder value for a slot (or card field) of a type; undefined when
 * the type needs a file or a web page (those stay empty in the sample).
 * @param {any} slot  `{ name, type, label, maxLength, maxItems, fields }`
 * @param {number} n  Position, to vary the content.
 * @returns {any}
 */
export function sampleValue(slot, n = 0) {
  const label = String(slot.label ?? slot.name ?? 'Text');
  switch (slot.type) {
    case 'text': {
      const text = TEXT_SAMPLES[slot.name] ?? label;
      return slot.maxLength ? text.slice(0, slot.maxLength) : text;
    }
    case 'richtext':
      return 'Most of us do our best **focus work** before lunch.\n\n- No meetings before 12:00\n- Chat on mute until noon';
    case 'list': {
      const items = ['No meetings before 12:00', 'Chat on mute until noon', 'Stand-up moves to 13:00', 'Quiet room in the library', 'Review after one month'];
      return items.slice(0, Math.min(slot.maxItems ?? 4, 4)).map((t) => `- ${t}`).join('\n');
    }
    case 'image':
      return { src: placeholderImage(n), alt: 'A placeholder picture: a gradient with a sun and hills.', fit: 'cover' };
    case 'quote':
      return { text: 'Make it work, make it right, make it fast.', source: 'Kent Beck' };
    case 'code':
      return { language: 'js', code: "const show = await loadShow('show.json');\nrender(show.slides[0]);" };
    case 'cards': {
      const count = Math.min(slot.maxItems ?? 3, 4);
      return Array.from({ length: count }, (_, i) => Object.fromEntries((slot.fields ?? [])
        .map((/** @type {any} */ f) => [f.name, f.type === 'text' ? cardText(f, i) : sampleValue(f, n + i + 1)])
        .filter(([, v]) => v !== undefined)));
    }
    case 'diagram':
      return { mermaid: 'flowchart LR\n  A[Template] --> B[Slides]\n  B --> C[Audience]\n  B --> D[Reader]' };
    case 'table':
      return {
        columns: [
          { key: 'region', label: 'Region' },
          { key: 'q1', label: 'Q1', format: 'integer', total: 'sum', visual: 'bar' },
          { key: 'change', label: 'Change', format: 'percent', decimals: 1, visual: 'sign' },
        ],
        rows: [['North', 412, 0.052], ['East', 368, -0.031], ['South', 295, 0.124], ['West', 251, 0.018]],
      };
    case 'tag-cloud':
      return {
        terms: [
          { text: 'reader layer', weight: 14 }, { text: 'templates', weight: 10 }, { text: 'tokens', weight: 9 },
          { text: 'colours', weight: 7 }, { text: 'fonts', weight: 6 }, { text: 'contrast', weight: 5 },
          { text: 'layouts', weight: 4 }, { text: 'slots', weight: 3 }, { text: 'preview', weight: 2 },
        ],
      };
    case 'graph':
      return {
        nodes: [
          { id: 'template', label: 'Template', tags: ['a'] }, { id: 'theme', label: 'theme.css', tags: ['b'] },
          { id: 'layouts', label: 'Layouts', tags: ['c'] }, { id: 'show', label: 'Show', tags: ['d'] },
        ],
        edges: [{ from: 'template', to: 'theme' }, { from: 'template', to: 'layouts' }, { from: 'show', to: 'template' }],
      };
    default:
      return undefined;
  }
}

/** @param {any} field @param {number} i */
function cardText(field, i) {
  const titles = ['Analyse', 'Design', 'Build', 'Measure'];
  const text = /title|heading|name/i.test(field.name) ? titles[i % titles.length] : `${field.label ?? field.name} ${i + 1}`;
  return field.maxLength ? text.slice(0, field.maxLength) : text;
}

/**
 * The reader blocks of the generated sample: every kind that needs no file.
 * @returns {any[]}
 */
export function sampleBlocks() {
  return [
    { id: 'intro', type: 'text', md: 'Most of us do our best [[focus-time]] work before lunch.^[Based on a team survey, September 2026.] A [link to the next slide](#s-sample-2) and some `code`.' },
    { id: 'more', type: 'details', title: 'What about urgent issues?', md: 'Incidents still go through the on-call phone. Everything else can wait until noon.', depth: 3 },
    { id: 'info', type: 'callout', variant: 'info', title: 'Info', md: 'A callout with the **info** colour.' },
    { id: 'tip', type: 'callout', variant: 'tip', title: 'Tip', md: 'Move recurring meetings yourself before asking the team to.' },
    { id: 'warn', type: 'callout', variant: 'warning', title: 'Warning', md: 'Do not book the quiet room for calls.' },
    { id: 'quote', type: 'callout', variant: 'quote', md: 'Make it work, make it right, make it fast.' },
    { id: 'tabs', type: 'tabs', tabs: [{ label: 'Team lead', md: 'Plan the week on Monday afternoon.' }, { label: 'Team member', md: 'Mute chat until noon.' }] },
  ];
}

/**
 * One slide per layout of the template, with placeholder content.
 * @param {any} template
 * @returns {any}  A show (format 0.2).
 */
export function generatedSample(template) {
  const slides = (template?.layouts ?? []).map((/** @type {any} */ layout, /** @type {number} */ i) => {
    /** @type {Record<string, any>} */
    const content = {};
    for (const slot of layout.slots ?? []) {
      const value = sampleValue(slot, i);
      if (value !== undefined) content[slot.name] = value;
    }
    /** @type {any} */
    const slide = { id: `s-sample-${i + 1}`, layout: layout.id, content };
    slide.reader = i === 1 || (template.layouts.length === 1)
      ? { summary: 'Three agreements give everyone focus time every morning.', blocks: sampleBlocks() }
      : { summary: `${layout.name ?? layout.id}: a sample slide.` };
    return slide;
  });
  return {
    slipr: '0.2',
    id: 'template-sample',
    meta: { title: 'Template sample', language: 'en' },
    template: { ref: `../templates/${template?.id ?? 'default'}` },
    glossary: { 'focus-time': { term: 'focus time', definition: 'A block of at least two hours without meetings or chat.' } },
    slides,
  };
}

/**
 * A sample show with only the slides whose layout the template has.
 * @param {any} show
 * @param {any} template
 * @returns {{ show: any, kept: number, total: number }}
 */
export function fitSample(show, template) {
  const ids = new Set((template?.layouts ?? []).map((/** @type {any} */ l) => l.id));
  const slides = (show?.slides ?? []).filter((/** @type {any} */ s) => ids.has(s.layout));
  return { show: { ...show, slides }, kept: slides.length, total: (show?.slides ?? []).length };
}

/**
 * The sample to start with: the sample show that fits most of the template's
 * layouts (at least half of its slides), else the generated one.
 * @param {any} template
 * @param {Map<string, any>} shows  Sample show id → show.
 * @returns {string}  A sample show id, or 'generated'.
 */
export function bestSample(template, shows) {
  let best = 'generated';
  let bestKept = 0;
  for (const [id, show] of shows) {
    const { kept, total } = fitSample(show, template);
    if (kept > bestKept && kept * 2 >= total) {
      best = id;
      bestKept = kept;
    }
  }
  return best;
}

/**
 * The show with another aspect ratio.
 * @param {any} show @param {'16:9' | '4:3'} aspect
 */
export function withAspect(show, aspect) {
  return { ...show, settings: { ...(show.settings ?? {}), aspectRatio: aspect } };
}
