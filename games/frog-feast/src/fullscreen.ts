type LegacyDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type LegacyElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function fullscreenControl(button: HTMLButtonElement, draw: (active: boolean) => void, notify: () => void) {
  const doc = document as LegacyDocument, root = document.documentElement as LegacyElement;
  const standard = () => doc.fullscreenEnabled === true && typeof root.requestFullscreen === 'function' && typeof doc.exitFullscreen === 'function';
  const legacy = () => doc.webkitFullscreenEnabled === true && typeof root.webkitRequestFullscreen === 'function' && typeof doc.webkitExitFullscreen === 'function';
  let pending = false;
  const sync = () => {
    const full = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement), label = full ? '退出全屏' : '进入全屏';
    button.hidden = !standard() && !legacy();
    button.setAttribute('aria-label', label); button.dataset.tooltip = label;
    button.setAttribute('aria-pressed', String(full)); draw(full);
  };
  const toggle = async () => {
    if (pending) return;
    pending = true;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
      else if (standard()) await root.requestFullscreen();
      else if (legacy()) await root.webkitRequestFullscreen?.();
    } catch { notify(); }
    finally { pending = false; }
  };
  button.addEventListener('click', toggle);
  doc.addEventListener('fullscreenchange', sync); doc.addEventListener('webkitfullscreenchange', sync);
  doc.addEventListener('fullscreenerror', notify); doc.addEventListener('webkitfullscreenerror', notify);
  sync();
  return () => {
    button.removeEventListener('click', toggle);
    doc.removeEventListener('fullscreenchange', sync); doc.removeEventListener('webkitfullscreenchange', sync);
    doc.removeEventListener('fullscreenerror', notify); doc.removeEventListener('webkitfullscreenerror', notify);
  };
}
