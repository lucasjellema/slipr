// @ts-check
/**
 * Prompt kit (I-080): an instruction that lets any AI chatbot write a valid
 * show.json for a template, plus the fix-up message for a show with errors.
 *
 * Layouts, slots and limits come from template.json; enums (block types,
 * callout variants, transitions, …) from show.schema.json, so the prompt
 * follows the format. The prose is guidance, kept here.
 * Spec: docs/specs/I-080-prompt-kit.md. No Node APIs: the viewer uses it too.
 */
import showSchema from './schema/show.schema.json' with { type: 'json' };

/** @typedef {'full' | 'compact'} PromptVariant */
/** @typedef {import('./schema-check.js').Issue} Issue */

/** Show format version the prompt asks for. */
export const PROMPT_FORMAT = '0.2';

/** Heading of the section the user fills in; `fillBrief()` replaces it. */
export const BRIEF_HEADING = '## Your content';

/** Size budget of the compact variant, in characters. */
export const COMPACT_BUDGET = 12000;

/** Reader block types the prompt teaches (decision 2 of the spec). */
export const CORE_BLOCK_TYPES = ['text', 'details', 'callout', 'tabs', 'image', 'slide-ref', 'diagram', 'table', 'tag-cloud'];

/** Slot types a chatbot cannot fill: they need a file, a web address or coordinates. */
const LEFT_OUT_SLOTS = /** @type {Record<string, string>} */ ({
  web: 'needs a live web page',
  pdf: 'needs a PDF file',
  graph: 'needs a network of nodes and links',
  map: 'needs coordinates and map tiles',
  chart: 'not available yet',
});

/**
 * The `template` object a show for this template must carry. Root-relative,
 * as the editor writes for new shows (D-012); opened from a folder, it is
 * resolved by name.
 * @param {{ id: string, version: string }} template
 * @returns {{ ref: string, version: string }}
 */
export function templateRefFor(template) {
  const [major, minor] = template.version.split('.');
  return { ref: `/templates/${template.id}`, version: major === '0' ? `^0.${minor}` : `^${major}.0` };
}

/**
 * Why a chatbot should not use this layout, or null when it can.
 * @param {{ slots: { type: string, required?: boolean }[] }} layout
 * @returns {string | null}
 */
export function leftOutReason(layout) {
  const slot = layout.slots.find((s) => s.required && LEFT_OUT_SLOTS[s.type]);
  return slot ? LEFT_OUT_SLOTS[slot.type] : null;
}

/**
 * Build the prompt for a template.
 * @param {any} template Parsed template.json.
 * @param {{ variant?: PromptVariant }} [options]
 * @returns {string} Markdown.
 */
export function buildPrompt(template, { variant = 'full' } = {}) {
  const full = variant === 'full';
  const ref = templateRefFor(template);
  const parts = [
    `# Write a Slipr show: ${template.name} template (${full ? 'full' : 'compact'} instruction)`,
    full
      ? '> Paste this whole text into an AI chatbot, fill in the last section, and send it. When it is too long to paste, attach this file instead and write "Follow the attached instruction" with your content below it.'
      : '> Compact version for tools with small prompt limits. When even this is too long, attach the file instead of pasting it.',
    intro(full),
    outputRules(ref),
    structure(full),
    layoutsSection(template, full),
    full ? markdownSection() : markdownCompact(),
    imagesSection(),
    full ? guidelines() : null,
    full ? exampleSection(template) : null,
    selfCheck(),
    briefSection(),
  ];
  return parts.filter(Boolean).join('\n\n') + '\n';
}

/**
 * Replace the "Your content" section of a prompt with the user's brief.
 * @param {string} prompt Output of `buildPrompt()`.
 * @param {{ topic?: string, audience?: string, slides?: number | string, reader?: boolean,
 *   profiles?: string, language?: string, source?: string }} brief Empty fields keep their placeholder.
 * @returns {string}
 */
export function fillBrief(prompt, brief) {
  const at = prompt.lastIndexOf(BRIEF_HEADING);
  const head = at >= 0 ? prompt.slice(0, at) : `${prompt.trimEnd()}\n\n`;
  return head + briefSection(brief) + '\n';
}

/**
 * The follow-up message for a chatbot whose show.json has errors.
 * "Image not found" warnings are left out: those files are the user's to-do list.
 * @param {Issue[]} errors
 * @param {Issue[]} [warnings]
 * @returns {string}
 */
export function fixUpPrompt(errors, warnings = []) {
  const line = (/** @type {Issue} */ i) => `- \`${i.path || '(root)'}\`: ${i.message}`;
  const kept = warnings.filter((w) => !isMissingFile(w));
  const out = [
    'The Slipr viewer could not show the show.json you wrote. Fix these problems and keep everything else as it is.',
    '',
    `Errors (${errors.length}):`,
    ...errors.map(line),
  ];
  if (kept.length > 0) out.push('', `Warnings (${kept.length}), fix these too where you can:`, ...kept.map(line));
  out.push(
    '',
    'Paths like `slides[3].content.title` point into the JSON: the fourth slide (counting from 0), its content, the title slot.',
    'Answer with the complete corrected show.json in one ```json code block, and nothing after it.',
  );
  return out.join('\n') + '\n';
}

/**
 * A small show for this template, used as the worked example (and tested to be valid).
 * @param {any} template
 * @returns {any}
 */
export function exampleShow(template) {
  const layouts = /** @type {any[]} */ (template.layouts).filter((l) => !leftOutReason(l));
  const allText = (/** @type {any} */ l) => l.slots.every((s) => !s.required || s.type === 'text');
  const opener = layouts.find(allText) ?? layouts[0];
  const content = layouts.find((l) => l !== opener && l.slots.some((s) => s.name === 'body'))
    ?? layouts.find((l) => l !== opener && l.slots.some((s) => s.type === 'list' || s.type === 'richtext'))
    ?? layouts[1];
  const from = layouts.indexOf(content);
  const pictured = layouts.find((l, i) => i > from && l.slots.some((s) => s.required && s.type === 'image'))
    ?? layouts.find((l) => l !== opener && l !== content);

  return {
    slipr: PROMPT_FORMAT,
    id: 'quiet-mornings',
    meta: { title: 'Quiet mornings', subtitle: 'Why we keep meetings out of the morning', author: 'Team Delta', date: '2026-10-15', language: 'en' },
    template: templateRefFor(template),
    chapters: [{ id: 'why', title: 'Why' }, { id: 'how', title: 'How' }],
    glossary: {
      'focus-time': { term: 'focus time', definition: 'A block of at least two hours without meetings or chat, for work that needs concentration.' },
    },
    profiles: [
      { id: 'lead', label: 'Team lead', description: 'Planning and agreements' },
      { id: 'member', label: 'Team member', description: 'What changes in your day' },
    ],
    paths: [{ id: 'short', label: 'Two-minute version', slides: ['opening', 'what-changes'] }],
    slides: [
      {
        id: 'opening', layout: opener.id, chapter: 'why',
        content: fill(opener, { title: 'Quiet mornings', subtitle: 'Meetings move to the afternoon', byline: 'Team Delta, October 2026', kicker: 'Proposal' }),
        notes: 'Start with the question: when did you last have two quiet hours?',
        reader: { summary: 'We protect the morning for focused work and meet in the afternoon.' },
      },
      {
        id: 'what-changes', layout: content.id, chapter: 'how',
        content: fill(content, {
          title: 'What changes',
          kicker: 'The plan',
          body: '- No meetings before 12:00\n- Chat on mute until noon\n- Stand-up moves to 13:00',
        }),
        audience: { fragments: true },
        reader: {
          summary: 'Three agreements give everyone [[focus-time]] every morning.',
          blocks: [
            { id: 'why-noon', type: 'text', md: 'Most of us do our best [[focus-time]] work before lunch.^[Based on our team survey of September 2026.]' },
            { id: 'exceptions', type: 'details', title: 'What about urgent issues?', md: 'Incidents still go through the on-call phone. Everything else can wait until noon.', depth: 3 },
            { id: 'lead-tip', type: 'callout', variant: 'tip', for: ['lead'], md: 'Move recurring meetings yourself before asking the team to.' },
          ],
          related: ['the-room'],
        },
      },
      {
        id: 'the-room', layout: pictured.id, chapter: 'how',
        content: fill(pictured, {
          title: 'A room for quiet work',
          kicker: 'Where',
          caption: 'The library corner on the second floor',
          image: { src: 'images/quiet-room-library-corner.png', alt: 'A bright library corner with four desks by a window, plants, and nobody talking; a sign on the wall reads "Quiet until noon".' },
        }),
        reader: {
          summary: 'The library corner is the quiet room in the mornings.',
          blocks: [{ id: 'back', type: 'slide-ref', slide: 'what-changes', label: 'Back to the agreements' }],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sections

/** @param {boolean} full */
function intro(full) {
  const lines = [
    '## What you are writing',
    'Slipr is presentation software. A show is one JSON file, `show.json`, that gives two experiences:',
    '- **Audience mode**: a linear slideshow for the room. Every slide has a concise **audience layer** (`content`): a title and a few words, never paragraphs.',
    '- **Reader mode**: an interactive page for one reader. Every slide can have a **reader layer** (`reader`) with the depth: explanations, collapsible details, tips, tabs, glossary popups. Readers pick a **profile** (blocks can target profiles) and a **detail level** (blocks have a `depth`).',
    'Keep slides short and put the depth in the reader layer.',
  ];
  if (full) lines.push('You write the whole `show.json` from the content brief at the end of this message. The user opens it in the Slipr viewer, which checks it strictly against a schema: an unknown field or a wrong type is an error.');
  return lines.join('\n');
}

/** @param {{ ref: string, version: string }} ref */
function outputRules(ref) {
  return [
    '## Output rules',
    '1. Answer with **one** ```json code block holding the complete show.json. Write nothing after the code block; a short sentence before it is fine.',
    `2. Start with \`"slipr": "${PROMPT_FORMAT}"\` and use exactly \`"template": ${JSON.stringify(ref)}\`.`,
    '3. Use only the fields, layouts, slot names and block types described here. Unknown fields are errors.',
    '4. Ids: the show `id` is lower-case kebab-case (`quiet-mornings`). Slide, chapter, profile, path, block and glossary ids use letters, digits, `-` and `_`, preferably kebab-case, and are unique (block ids within their slide). Make slide ids describe the slide (`what-changes`, not `s1`).',
    '5. Valid JSON: double quotes, no comments, no trailing commas; newlines inside strings as `\\n`.',
  ].join('\n');
}

/** @param {boolean} full */
function structure(full) {
  const def = /** @type {any} */ (showSchema).$defs;
  const choice = (/** @type {string[]} */ values) => values.map((v) => JSON.stringify(v)).join(' | ');
  const transitions = choice(def.transition.enum);
  const aspects = choice(def.settings.properties.aspectRatio.enum);
  const variants = def.blockCallout.properties.variant.enum.map(code).join(', ');
  const depth = def.depth.enum.join(', ');
  const blockTypes = CORE_BLOCK_TYPES;
  const lines = [
    '## Show structure',
    '```',
    '{',
    `  "slipr": "${PROMPT_FORMAT}", "id": "kebab-case-id",`,
    '  "meta": { "title": "…" (required), "subtitle", "author", "date": "YYYY-MM-DD", "language": "en", "description", "tags": [] },',
    '  "template": { … see output rules … },',
    `  "settings": { "aspectRatio": ${aspects}, "transition": ${transitions}, "slideNumbers": true, "agenda": false },`,
    '  "chapters": [ { "id", "title", "summary"? } ],',
    '  "glossary": { "term-id": { "term", "definition", "aliases"?: [], "link"? } },',
    '  "profiles": [ { "id", "label", "description"? } ],',
    '  "paths": [ { "id", "label", "description"?, "slides": ["slide-id", …] or "*" } ],',
    '  "slides": [ slide, … ]',
    '}',
    '```',
    'Only `slipr`, `id`, `meta`, `template` and `slides` are required. A slide:',
    '```',
    '{ "id", "layout": "layout id", "chapter"?: "chapter id", "tags"?: [],',
    '  "content": { "slot name": value, … },      ← audience layer',
    '  "notes"?: "speaker notes (Markdown)",',
    '  "audience"?: { "fragments": true (bullets appear one by one), "hidden": true (backup slide) },',
    '  "reader"?: { "summary": "one-line takeaway", "blocks": [ block, … ], "related": ["slide-id"], "showSlide": false (reader-only text page), "hidden": true } }',
    '```',
    `Reader blocks: every block has \`id\` and \`type\`; optional \`for: ["profile-id"]\` (only those profiles see it) and \`depth\` (${depth}: essential, standard (default), deep dive). Types:`,
  ];
  const blocks = /** @type {Record<string, string>} */ ({
    text: '`text`: `md`',
    details: '`details` (collapsible): `title`, `md`, `open`?',
    callout: `\`callout\`: \`variant\` (${variants}), \`title\`?, \`md\``,
    tabs: '`tabs`: `tabs: [{ "label", "md" }]`',
    image: '`image`: `image` (an image value), `caption`?, `hotspots`?: `[{ "x": 0–1, "y": 0–1, "title", "md" }]` (positions on the picture, opened as popups)',
    'slide-ref': '`slide-ref` (link card): `slide`, `label`?',
    diagram: '`diagram`: `mermaid` (Mermaid source, e.g. `"flowchart LR\\n  A --> B"`), `caption`?',
    table: '`table`: `columns`, `rows`, `title`? (see *Tables* below)',
    'tag-cloud': '`tag-cloud`: `terms`, `title`? (see *Tag clouds* below)',
  });
  for (const type of blockTypes) lines.push(`- ${blocks[type]}`);
  if (full) {
    lines.push('', 'Do not use other block types or fields (no `embed`, `pdf`, `graph`, `map`, `data` files, `overlays`, or styling): they need files or settings a chatbot cannot provide.');
    lines.push('', tablesAndClouds());
  } else {
    lines.push('Tables: `{ "columns": [{ "key", "label"?, "format"? }], "rows": [[cell, …], …] }`, cells in column order. Tag clouds: `{ "terms": [{ "text", "weight"? }] }`. No CSV `data` files, no other block types.');
  }
  return lines.join('\n');
}

function tablesAndClouds() {
  const def = /** @type {any} */ (showSchema).$defs;
  const formats = findEnum(def, 'format', 'markdown');
  const orders = findEnum(def, 'order', 'alphabetical');
  return [
    '**Tables** (block, or a `table` slot) hold their data inline:',
    '```json',
    '{ "columns": [{ "key": "team", "label": "Team" }, { "key": "hours", "label": "Focus hours", "format": "number", "total": "sum" }],',
    '  "rows": [["Delta", 14], ["Echo", 9]], "sortable": true }',
    '```',
    `Column fields: \`key\` (required), \`label\`, \`format\` (${formats.map(code).join(', ')}; \`percent\` shows 0.125 as 12.5 %), \`decimals\`, \`total\` (\`sum\`, \`avg\`, \`min\`, \`max\`, \`count\`). Each row is an array of cells (string, number or null) in column order. Optional: \`sortable\`, \`filter\` (a search box), \`caption\`.`,
    '',
    '**Tag clouds** (block, or a `tag-cloud` slot): `{ "terms": [{ "text": "focus", "weight": 12 }, { "text": "meetings", "weight": 7 }] }`. A heavier term is shown bigger. ' +
      `Optional: \`order\` (${orders.map(code).join(', ')}), \`maxTerms\`, \`weightLabel\` (what a weight counts, e.g. "mentions"), \`caption\`. A term whose text is a glossary term links to its definition.`,
  ].join('\n');
}

/** @param {any} template @param {boolean} full */
function layoutsSection(template, full) {
  const usable = /** @type {any[]} */ (template.layouts).filter((l) => !leftOutReason(l));
  const skipped = /** @type {any[]} */ (template.layouts).filter((l) => leftOutReason(l));
  const types = new Set(usable.flatMap((l) => l.slots.map((/** @type {any} */ s) => s.type)));
  const lines = [
    `## Layouts of the ${template.name} template`,
    'Every slide uses one layout; its `content` holds the slots listed. **Required** slots must be filled; others are optional and can be left out. Keep within the limits: "≤ 70" is a maximum number of characters, "≤ 7 items" the most list items or cards.',
    '',
  ];
  for (const layout of usable) {
    lines.push(`- **\`${layout.id}\`** (${layout.name})${layout.description ? `: ${layout.description}` : ''}`);
    for (const slot of layout.slots) {
      if (LEFT_OUT_SLOTS[slot.type]) continue;
      lines.push(`  - \`${slot.name}\`: ${slotSummary(slot)}${full && slot.help ? `. ${slot.help}` : ''}`);
      if (slot.type === 'cards') {
        for (const field of slot.fields ?? []) lines.push(`    - card field \`${field.name}\`: ${slotSummary(field)}`);
      }
    }
  }
  if (skipped.length > 0) {
    lines.push('', '**Do not use** these layouts:');
    for (const layout of skipped) lines.push(`- \`${layout.id}\`: ${leftOutReason(layout)}`);
  }
  lines.push('', '**Slot values by type:**');
  const values = /** @type {Record<string, string>} */ ({
    text: '`text`: a plain string, one line, no Markdown',
    richtext: '`richtext`: a Markdown string (paragraphs and `- ` bullet lists)',
    list: '`list`: a Markdown bullet list as one string (`"- one\\n- two"`), or an array of strings',
    image: '`image`: `{ "src": "images/name.png", "alt": "…" }`, optionally `"fit": "cover"` (fill, may crop) or `"contain"` (default)',
    code: '`code`: `{ "language": "js", "code": "…" }`',
    quote: '`quote`: `{ "text": "…", "source": "…" }`',
    diagram: '`diagram`: `{ "mermaid": "flowchart LR\\n  A --> B", "caption": "…" }`',
    table: '`table`: inline `columns` and `rows`, as the table block',
    'tag-cloud': '`tag-cloud`: `{ "terms": [{ "text", "weight" }] }`, as the tag cloud block',
    cards: '`cards`: an array of objects, one per card, with the card fields listed (field name → value)',
  });
  for (const type of Object.keys(values)) if (types.has(type)) lines.push(`- ${values[type]}`);
  return lines.join('\n');
}

/** @param {{ type: string, required?: boolean, maxLength?: number, maxItems?: number }} slot */
function slotSummary(slot) {
  const bits = [slot.type];
  if (slot.required) bits.push('**required**');
  if (slot.maxLength) bits.push(`≤ ${slot.maxLength}`);
  if (slot.maxItems) bits.push(`≤ ${slot.maxItems} ${slot.type === 'cards' ? 'cards' : 'items'}`);
  return bits.join(', ');
}

function markdownSection() {
  return [
    '## Markdown',
    'Used in `richtext` and `list` slots, `notes`, and every `md` field:',
    '- `**bold**`, `*italic*`, `` `code` ``, `[link](https://…)`, `- bullets` (nested with two spaces), `1.` numbered lists, fenced code blocks (reader blocks only).',
    '- A paragraph that is entirely bold (`**Key findings**` on its own line) becomes a subheading.',
    '- Glossary term: `[[term-id]]` shows the term, `[[term-id|other words]]` shows other words; both open the definition in reader mode. Every id must exist in `glossary`. In reader mode, the first time a glossary term appears on a slide it is linked automatically too.',
    '- Popup note: `^[extra detail]` shows a small marker in reader mode that opens the text; it is left out in audience mode.',
    '- Slide link: `[see the plan](#slide-id)`.',
    '- No HTML: it is shown as text.',
  ].join('\n');
}

function markdownCompact() {
  return '## Markdown\n`**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `- bullets`, `[[glossary-id]]` or `[[glossary-id|text]]` (ids must exist in `glossary`), `^[popup note]` (reader mode only), `[text](#slide-id)`. No HTML.';
}

function imagesSection() {
  return [
    '## Images',
    'You cannot supply image files, so use placeholders: `"src": "images/<descriptive-kebab-name>.png"` and an `alt` text that describes the wanted picture in detail (subject, setting, mood, any text in it), so the user can find or make it. Every image needs `alt`. Use an image only where the layout requires one or it really helps.',
  ].join('\n');
}

function guidelines() {
  return [
    '## Writing guidelines',
    '- **Audience layer**: titles of a few words; at most 5–6 bullets of a few words each; no full sentences where a phrase will do. Respect every slot limit.',
    '- **Reader layer**: give every slide a `reader.summary` (one sentence). Put explanations, evidence, examples and caveats in reader blocks: `text` for the main explanation, `details` for side questions, `callout` for tips and warnings, `tabs` for alternatives. Mark deep dives `depth: 3` and essentials `depth: 1`.',
    '- **Profiles**: only when the brief names them. Target a block with `for` when it matters to one profile only; leave `for` out for everyone.',
    '- **Chapters** for shows of more than about eight slides; set `chapter` on every slide. A **path** can offer a short route through the key slides.',
    '- **Glossary**: define the jargon the audience may not know and refer to it with `[[term-id]]`.',
    '- **Speaker notes** (`notes`): what the presenter says, a few sentences per slide.',
    '- Start with an opening slide and end with a summary or call to action. Use the layouts the content asks for, with some variety.',
    '- Write in the language of the brief (`meta.language`).',
    '- When the brief says **Reader layer: no**, give each slide only `reader.summary`, no blocks.',
  ].join('\n');
}

/** @param {any} template */
function exampleSection(template) {
  return [
    '## Example',
    'A small show for this template (yours will be longer and about the brief):',
    '```json',
    compactJson(exampleShow(template)),
    '```',
  ].join('\n');
}

function selfCheck() {
  return [
    '## Check before you answer',
    '- [ ] One ```json code block with the complete show; `slipr`, `id`, `meta.title`, `template` and `slides` are present; the JSON parses.',
    '- [ ] Every `layout` is one of the layouts above (not a *Do not use* one), and its `content` uses only that layout\'s slot names, with every required slot filled.',
    '- [ ] No text is longer than its slot limit, no list has more items than allowed.',
    '- [ ] Slide ids are unique; block ids are unique within their slide; `chapter`, `for`, `related`, `slide-ref`, `paths` and `[text](#…)` only name ids that exist.',
    '- [ ] Every `[[term-id]]` is in `glossary`.',
    '- [ ] Every image has a placeholder `src` under `images/` and a descriptive `alt`.',
    '- [ ] No fields that are not described here.',
  ].join('\n');
}

/**
 * @param {{ topic?: string, audience?: string, slides?: number | string, reader?: boolean,
 *   profiles?: string, language?: string, source?: string }} [brief]
 */
function briefSection(brief = {}) {
  const or = (/** @type {unknown} */ value, /** @type {string} */ placeholder) => {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || placeholder;
  };
  const reader = brief.reader === undefined
    ? '<yes: add reader blocks with depth | no: only a summary per slide>'
    : brief.reader ? 'yes' : 'no';
  return [
    BRIEF_HEADING,
    `Topic: ${or(brief.topic, '<what the show is about>')}`,
    `Audience: ${or(brief.audience, '<who will watch or read it>')}`,
    `Number of slides: ${or(brief.slides, '<about 10>')}`,
    `Reader layer: ${reader}`,
    `Profiles: ${or(brief.profiles, '<e.g. Developer, Manager; or none>')}`,
    `Language: ${or(brief.language, 'en')}`,
    'Source material:',
    or(brief.source, '<paste notes, an outline or an article here, or attach files>'),
  ].join('\n');
}

// ---------------------------------------------------------------------------

/** A missing image file: the user still has to add it (validator code `missing-file`). */
function isMissingFile(/** @type {Issue} */ issue) {
  return issue.code === 'missing-file' && issue.message.startsWith('image file');
}

/**
 * JSON with two-space indents, but every object or array that fits on one
 * line of about 100 characters on that line: shorter for the prompt.
 * @param {any} value @param {string} [indent]
 * @returns {string}
 */
function compactJson(value, indent = '') {
  const flat = oneLine(value);
  if (value === null || typeof value !== 'object' || flat.length + indent.length <= 100) return flat;
  const inner = `${indent}  `;
  const items = Array.isArray(value)
    ? value.map((v) => inner + compactJson(v, inner))
    : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner)}`);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${items.join(',\n')}\n${indent}${close}`;
}

/** @param {any} value @returns {string} */
function oneLine(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;
  const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`);
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
}

/** @param {string} s */
function code(s) {
  return `\`${s}\``;
}

/**
 * The first enum named `key` in the schema's definitions that contains `marker`.
 * @param {any} node @param {string} key @param {string} marker
 * @returns {string[]}
 */
function findEnum(node, key, marker) {
  if (!node || typeof node !== 'object') return [];
  const own = node[key];
  if (own && Array.isArray(own.enum) && own.enum.includes(marker)) return own.enum;
  for (const child of Object.values(node)) {
    const found = findEnum(child, key, marker);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Content for a layout from a pool of sample values by slot name (and an image
 * for image slots), so the example fits any template.
 * @param {any} layout @param {Record<string, any>} pool
 */
function fill(layout, pool) {
  /** @type {Record<string, any>} */
  const content = {};
  for (const slot of layout.slots) {
    let value = pool[slot.name];
    if (value === undefined && slot.type === 'image' && slot.required) value = pool.image;
    if (value === undefined && (slot.type === 'richtext' || slot.type === 'list') && slot.required) value = pool.body;
    if (value === undefined && slot.type === 'text' && slot.required) value = pool.title;
    if (value === undefined) continue;
    if (slot.type === 'image' && typeof value !== 'object') continue;
    if (slot.type !== 'image' && typeof value === 'object') continue;
    content[slot.name] = value;
  }
  return content;
}
