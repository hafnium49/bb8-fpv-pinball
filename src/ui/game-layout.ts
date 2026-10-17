/** Touch-capable tablets keep the full playfield, including with a trackpad. */
export function usesDesktopCabinet(largeViewport: boolean, touchCapable: boolean) {
  return largeViewport && !touchCapable;
}

/** Observe the laid-out container, not just the window: mobile browser chrome,
 * fullscreen and CSS breakpoints can all resize it after the initial event. */
export function observeGameLayout(container: HTMLElement, resize: () => void, rotate: () => void) {
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; resize(); });
  };
  const orientation = () => { rotate(); schedule(); };
  const portrait = matchMedia('(orientation: portrait)');
  // The media query also covers browsers without Screen Orientation support.
  // Explicit orientation events additionally cover a 180-degree rotation.
  portrait.addEventListener('change', orientation);
  window.screen.orientation?.addEventListener('change', orientation);
  window.addEventListener('orientationchange', orientation);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  document.addEventListener('fullscreenchange', schedule);
  const observer = new ResizeObserver(schedule);
  observer.observe(container);
  schedule();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    portrait.removeEventListener('change', orientation);
    window.screen.orientation?.removeEventListener('change', orientation);
    window.removeEventListener('orientationchange', orientation);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    document.removeEventListener('fullscreenchange', schedule);
  };
}
