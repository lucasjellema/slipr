// @ts-check
/**
 * Global keyboard shortcuts for Slipr Editor.
 */

/**
 * Register global keyboard shortcuts on the window.
 * @param {import('./store.js').EditorStore} store
 * @param {{ onSave?: () => void, onPresent?: () => void, onRead?: () => void }} [handlers]
 */
export function registerShortcuts(store, { onSave, onPresent, onRead } = {}) {
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

    // New slide: Ctrl+Enter
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      const currentId = store.state.selectedSlideId;
      store.dispatch('addSlide', { afterSlideId: currentId });
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

    // Present: F5
    if (e.key === 'F5') {
      e.preventDefault();
      if (onPresent) onPresent();
    }
  });
}
