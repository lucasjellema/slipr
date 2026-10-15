// @ts-check
/**
 * "Create with AI" page (I-080): pick a template, describe the show, copy or
 * download the prompt for an AI chatbot. The prompts are the generated files
 * in docs/ai/prompts/ (npm run prompt); this page only fills in the brief.
 * Nothing typed here is sent anywhere.
 */
import { fillBrief } from '../../shared/prompt-kit.js';
import { copyText } from './dom.js';

const TEMPLATES = new URL('../../templates/', import.meta.url);
const PROMPTS = new URL('../../docs/ai/prompts/', import.meta.url);

const form = /** @type {HTMLFormElement} */ (document.getElementById('kit'));
const templateSelect = /** @type {HTMLSelectElement} */ (document.getElementById('template'));
const copyButton = /** @type {HTMLButtonElement} */ (document.getElementById('copy'));
const downloadButton = /** @type {HTMLButtonElement} */ (document.getElementById('download'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const preview = /** @type {HTMLTextAreaElement} */ (document.getElementById('preview'));
const size = /** @type {HTMLElement} */ (document.getElementById('size'));

/** Prompt files by "<template>-<variant>", fetched once. */
const cache = new Map();
let current = '';
let request = 0;

/** @param {string} key */
async function promptFile(key) {
  if (!cache.has(key)) {
    cache.set(key, fetch(new URL(`${key}.md`, PROMPTS)).then((r) => {
      if (!r.ok) throw new Error(`${key}.md: ${r.status}`);
      return r.text();
    }));
  }
  try {
    return await cache.get(key);
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

function brief() {
  const data = new FormData(form);
  const text = (/** @type {string} */ name) => String(data.get(name) ?? '').trim();
  return {
    topic: text('topic'),
    audience: text('audience'),
    slides: text('slides'),
    reader: data.get('reader') === 'on',
    profiles: text('profiles'),
    language: text('language'),
    source: text('source'),
  };
}

function fileName() {
  const variant = new FormData(form).get('variant');
  return `slipr-prompt-${templateSelect.value}-${variant}.md`;
}

async function update() {
  const mine = ++request;
  const key = `${templateSelect.value}-${new FormData(form).get('variant')}`;
  try {
    const prompt = await promptFile(key);
    if (mine !== request) return;
    current = fillBrief(prompt, brief());
    preview.value = current;
    size.textContent = `${current.length.toLocaleString()} characters`;
    copyButton.disabled = false;
    downloadButton.disabled = false;
  } catch (err) {
    if (mine !== request) return;
    current = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    status.textContent = `The instruction could not be loaded (${err instanceof Error ? err.message : err}).`;
  }
}

async function loadTemplates() {
  const index = await (await fetch(new URL('index.json', TEMPLATES))).json();
  const options = await Promise.all(index.templates.map(async (/** @type {string} */ id) => {
    try {
      const template = await (await fetch(new URL(`${id}/template.json`, TEMPLATES))).json();
      return new Option(template.name ?? id, id);
    } catch {
      return new Option(id, id);
    }
  }));
  templateSelect.replaceChildren(...options);
  templateSelect.disabled = false;
}

form.addEventListener('input', () => {
  status.textContent = '';
  update();
});
form.addEventListener('submit', (e) => e.preventDefault());

copyButton.addEventListener('click', async () => {
  const ok = await copyText(current);
  status.textContent = ok
    ? 'Copied. Paste it into a new chat with your AI chatbot.'
    : 'Copying did not work here: open "Show the instruction" and copy the text yourself.';
});

downloadButton.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([current], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = `Saved as ${link.download}. Attach it in a new chat.`;
});

try {
  await loadTemplates();
  await update();
} catch (err) {
  status.textContent = `The templates could not be loaded (${err instanceof Error ? err.message : err}). Serve Slipr with npm run serve.`;
}
