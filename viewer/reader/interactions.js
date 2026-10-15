// @ts-check
/**
 * Interactive behaviour of reader content:
 *  - popovers for glossary terms (.slipr-term), inline footnotes
 *    (.slipr-footnote-ref), image hotspots (.slipr-hotspot) and tag cloud
 *    terms (.slipr-tag-cloud-term, I-105: the glossary definition and the
 *    slides that mention the term)
 *  - ARIA tabs (role=tablist) with arrow-key navigation
 *
 * One shared popover element in the top layer (native Popover API), placed
 * next to its trigger with JS (works in every current browser).
 * Mouse: opens on hover after a short delay. Touch and keyboard: click/Enter
 * toggles. Esc and clicking elsewhere close it (popover="auto").
 */
import { markdown, escape } from '../../shared/markdown.js';
import { slideTitle } from '../../shared/render.js';
import { buildSearchIndex, slidesMentioning } from './search-index.js';

const TRIGGERS = '.slipr-term, .slipr-footnote-ref, .slipr-hotspot, .slipr-tag-cloud-term';
const OPEN_DELAY = 250;
const CLOSE_DELAY = 200;

/**
 * @param {HTMLElement} root  Container with reader content.
 * @param {any} show
 */
export function setupInteractions(root, show) {
  const pop = document.createElement('div');
  pop.id = 'slipr-popover';
  pop.className = 'slipr-popover';
  pop.setAttribute('popover', 'auto');
  pop.setAttribute('role', 'dialog');
  document.body.append(pop);

  /** @type {HTMLElement | null} */
  let current = null;
  let openTimer = 0;
  let closeTimer = 0;
  /** @type {'hover' | 'click' | null} */
  let openedBy = null;

  const open = (/** @type {HTMLElement} */ trigger, /** @type {'hover' | 'click'} */ how) => {
    clearTimeout(closeTimer);
    if (current === trigger && pop.matches(':popover-open')) {
      if (how === 'click') openedBy = 'click';
      return;
    }
    const content = popoverContent(trigger, show);
    if (!content) return;
    if (pop.matches(':popover-open')) pop.hidePopover();
    pop.innerHTML = content.html;
    pop.setAttribute('aria-label', content.label);
    current = trigger;
    openedBy = how;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', pop.id);
    pop.showPopover();
    place(pop, trigger);
  };

  const close = () => {
    clearTimeout(openTimer);
    if (pop.matches(':popover-open')) pop.hidePopover();
  };

  // A slide link in the popover (tag cloud terms) goes there and closes it.
  pop.addEventListener('click', (event) => {
    if (/** @type {Element} */ (event.target).closest('a[data-slide-link]')) close();
  });

  pop.addEventListener('toggle', (event) => {
    if (/** @type {ToggleEvent} */ (event).newState === 'closed') {
      current?.setAttribute('aria-expanded', 'false');
      current = null;
      openedBy = null;
    }
  });

  // Click / tap / Enter / Space: toggle.
  root.addEventListener('click', (event) => {
    const trigger = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest(TRIGGERS));
    if (!trigger) return;
    event.preventDefault();
    if (current === trigger && openedBy === 'click' && pop.matches(':popover-open')) close();
    else open(trigger, 'click');
  });

  // Hover with a mouse: open after a delay, close when leaving trigger and popover.
  root.addEventListener('pointerover', (event) => {
    if (/** @type {PointerEvent} */ (event).pointerType !== 'mouse') return;
    const trigger = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest(TRIGGERS));
    if (!trigger) return;
    clearTimeout(openTimer);
    openTimer = window.setTimeout(() => open(trigger, 'hover'), OPEN_DELAY);
  });
  root.addEventListener('pointerout', (event) => {
    const trigger = /** @type {Element} */ (event.target).closest(TRIGGERS);
    if (!trigger) return;
    clearTimeout(openTimer);
    if (openedBy === 'hover') closeTimer = window.setTimeout(close, CLOSE_DELAY);
  });
  pop.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  pop.addEventListener('pointerleave', () => {
    if (openedBy === 'hover') closeTimer = window.setTimeout(close, CLOSE_DELAY);
  });

  const reposition = () => {
    if (current && pop.matches(':popover-open')) place(pop, current);
  };
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);

  setupTabs(root);
}

/**
 * @param {HTMLElement} trigger
 * @param {any} show
 * @returns {{ html: string, label: string } | null}
 */
function popoverContent(trigger, show) {
  if (trigger.classList.contains('slipr-tag-cloud-term')) return tagContent(trigger, show);
  if (trigger.classList.contains('slipr-term')) {
    const id = trigger.dataset.term ?? '';
    const entry = show.glossary?.[id];
    if (!entry) return null;
    const definition = markdown(entry.definition ?? '', { mode: 'audience', glossary: show.glossary });
    const link = entry.link && /^https?:/i.test(entry.link)
      ? `<p class="slipr-popover-link"><a href="${escape(entry.link)}" target="_blank" rel="noopener noreferrer">Learn more ↗</a></p>`
      : '';
    return { html: `<p class="slipr-popover-title">${escape(entry.term)}</p>${definition}${link}`, label: entry.term };
  }
  if (trigger.classList.contains('slipr-footnote-ref')) {
    const note = trigger.nextElementSibling;
    if (!note?.classList.contains('slipr-footnote')) return null;
    return { html: `<p>${note.innerHTML}</p>`, label: trigger.getAttribute('aria-label') ?? 'Note' };
  }
  if (trigger.classList.contains('slipr-hotspot')) {
    const content = trigger.parentElement?.querySelector(`.slipr-hotspot-content[data-hotspot="${trigger.dataset.hotspot}"]`);
    if (!content) return null;
    return { html: content.innerHTML, label: trigger.getAttribute('aria-label') ?? 'Hotspot' };
  }
  return null;
}

/** The show's search documents, built on the first tag cloud popover. @type {WeakMap<object, import('./search-index.js').SearchDoc[]>} */
const indexes = new WeakMap();

/**
 * A tag cloud term (I-105): its glossary definition (when it has one), its
 * weight, and links to the other slides that mention it (by its name or the
 * glossary term's names).
 * @param {HTMLElement} trigger
 * @param {any} show
 * @returns {{ html: string, label: string }}
 */
function tagContent(trigger, show) {
  const text = trigger.dataset.tag ?? trigger.textContent ?? '';
  const entry = trigger.dataset.term ? show.glossary?.[trigger.dataset.term] : null;
  let docs = indexes.get(show);
  if (!docs) {
    docs = buildSearchIndex(show);
    indexes.set(show, docs);
  }
  const names = [text, ...(entry ? [entry.term, ...(Array.isArray(entry.aliases) ? entry.aliases : [])] : [])];
  const own = /** @type {HTMLElement | null} */ (trigger.closest('[data-slide-id]'))?.dataset.slideId ?? null;
  const slides = slidesMentioning(docs, names, own)
    .map((id) => show.slides?.find((/** @type {any} */ s) => s.id === id))
    .filter(Boolean);
  const parts = [`<p class="slipr-popover-title">${escape(entry?.term ?? text)}</p>`];
  if (entry) {
    parts.push(markdown(entry.definition ?? '', { mode: 'audience', glossary: show.glossary }));
    if (entry.link && /^https?:/i.test(entry.link)) {
      parts.push(`<p class="slipr-popover-link"><a href="${escape(entry.link)}" target="_blank" rel="noopener noreferrer">Learn more ↗</a></p>`);
    }
  }
  if (trigger.dataset.tagWeight) parts.push(`<p class="slipr-popover-meta">${escape(trigger.dataset.tagWeight)}</p>`);
  parts.push(slides.length
    ? `<p class="slipr-popover-meta">Mentioned on</p><ul class="slipr-popover-slides">${slides.map((/** @type {any} */ s) => `<li><a href="#${escape(s.id)}" data-slide-link="${escape(s.id)}">${escape(slideTitle(s))}</a></li>`).join('')}</ul>`
    : '<p class="slipr-popover-meta">Not mentioned on other slides.</p>');
  return { html: parts.join(''), label: entry?.term ?? text };
}

/**
 * Place the popover below the trigger (or above when there is no room),
 * horizontally centred and kept inside the viewport.
 * @param {HTMLElement} pop @param {HTMLElement} trigger
 */
function place(pop, trigger) {
  const gap = 8;
  const margin = 8;
  const t = trigger.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  let top = t.bottom + gap;
  if (top + p.height > innerHeight - margin && t.top - gap - p.height > margin) top = t.top - gap - p.height;
  const left = Math.min(Math.max(margin, t.left + t.width / 2 - p.width / 2), innerWidth - p.width - margin);
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(Math.max(margin, left))}px`;
}

/**
 * ARIA tabs: click to select; ←/→, Home/End move between tabs.
 * @param {HTMLElement} root
 */
function setupTabs(root) {
  const select = (/** @type {HTMLElement} */ tab) => {
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    for (const other of list.querySelectorAll('[role="tab"]')) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.setAttribute('tabindex', selected ? '0' : '-1');
      const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !selected;
    }
  };
  root.addEventListener('click', (event) => {
    const tab = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[role="tab"]'));
    if (tab) select(tab);
  });
  root.addEventListener('keydown', (event) => {
    const tab = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[role="tab"]'));
    if (!tab) return;
    const tabs = /** @type {HTMLElement[]} */ ([...(tab.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') ?? [])]);
    const i = tabs.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    select(target);
    target.focus();
  });
}
