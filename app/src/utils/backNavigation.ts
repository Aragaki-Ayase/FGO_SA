import { useEffect, useRef } from 'react';

interface LayerEntry {
  id: string;
  close: () => void;
}

const activeLayers: LayerEntry[] = [];
let suppressPopCount = 0;
let listenerInstalled = false;

function ensureGlobalListeners() {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;

  window.addEventListener('popstate', () => {
    if (suppressPopCount > 0) {
      suppressPopCount--;
      return;
    }
    const top = activeLayers.pop();
    if (top) {
      top.close();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeLayers.length > 0) {
      e.preventDefault();
      // Trigger history.back() so both history and top layer stay in sync
      window.history.back();
    }
  });
}

/**
 * Registers an open modal/drawer/lightbox layer with the browser/WebView history stack
 * so Android system back gesture / back button (and browser back / Esc) closes the topmost layer.
 */
export function useBackClose(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    ensureGlobalListeners();

    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: LayerEntry = {
      id,
      close: () => onCloseRef.current(),
    };

    activeLayers.push(entry);
    window.history.pushState({ fgoModalLayer: id }, '');

    return () => {
      const idx = activeLayers.findIndex((item) => item.id === id);
      if (idx !== -1) {
        // Layer was closed via UI button (not via popstate), so pop its history entry silently
        activeLayers.splice(idx, 1);
        suppressPopCount++;
        window.history.back();
      }
    };
  }, [isOpen]);
}
