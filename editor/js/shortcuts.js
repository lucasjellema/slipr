// @ts-check
/**
 * Global keyboard shortcuts for Slipr Editor.
 */

import { openHelp } from './help.js';
import { toggleSidebar } from './sidebar.js';

/**
 * Register global keyboard shortcuts on the window.
 * @param {import('./store.js').EditorStore} store
 * @param {{ onSave?: () => void, onOpen?: () => void, onPresent?: () => void, onRead?: () => void, onFindReplace?: () => void }} [handlers]
 */
export function registerShortcuts(store, { onSave, onOpen, onPresent, onRead, onFindReplace } = {}) {
  window.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Ctrl+Z / Cmd+Z
    // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        e.preventDefault();
        store.redo();
      } else {
        e.preventDefault();
        store.undo();
      }
      return;
    }
    if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      store.redo();
      return;
    }

    // Save: Ctrl+S / Cmd+S
    if (mod && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (onSave) onSave();
      return;
    }

    // Open a show: Ctrl+O / Cmd+O (I-102)
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      if (onOpen) onOpen();
      return;
    }

    // Find & Replace: Ctrl+F / Cmd+F or Ctrl+H / Cmd+H
    if (mod && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      if (onFindReplace) onFindReplace();
      return;
    }

    // New slide: Ctrl+Enter
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      const currentId = store.state.selectedSlideId;
      store.dispatch('addSlide', { afterSlideId: currentId, templateLayouts: store.state.template?.layouts });
      return;
    }

    // Collapse or expand the slide list (I-101): Ctrl+\ / Cmd+\
    if (mod && !e.altKey && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // Duplicate slide: Ctrl+D
    if (mod && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const currentId = store.state.selectedSlideId;
      if (currentId) {
        store.dispatch('duplicateSlide', { slideId: currentId });
      }
      return;
    }

    // Move slide up / down: Alt+ArrowUp / Alt+ArrowDown
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const currentId = store.state.selectedSlideId;
      const slides = store.state.show.slides;
      if (!currentId || !Array.isArray(slides)) return;
      const idx = slides.findIndex((s) => s.id === currentId);
      if (idx === -1) return;

      const targetIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < slides.length) {
        e.preventDefault();
        store.dispatch('moveSlide', { slideId: currentId, toIndex: targetIdx });
      }
      return;
    }

    // Previous / next slide: PageUp / PageDown, when not typing in a field
    // (the slide list handles its own keys, including PageUp/PageDown by pages).
    if (!mod && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest?.('input, textarea, select, [contenteditable], .slipr-slide-items')) return;
      const slides = store.state.show?.slides;
      if (!Array.isArray(slides) || slides.length === 0) return;
      const idx = slides.findIndex((s) => s.id === store.state.selectedSlideId);
      const next = Math.max(0, Math.min(slides.length - 1, idx + (e.key === 'PageUp' ? -1 : 1)));
      e.preventDefault();
      store.selectSlide(slides[next].id);
      return;
    }

    // User manual, at the section for the current tab: F1
    if (e.key === 'F1') {
      e.preventDefault();
      openHelp(store.state.activeTab);
      return;
    }

    // Present: F5
    if (e.key === 'F5') {
      e.preventDefault();
      if (onPresent) onPresent();
    }
  });
}
