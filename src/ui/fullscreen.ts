type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

/** Prefer a complete standard API. Do not mistake iPhone's video-only API for element fullscreen. */
export function fullscreenAPI(element: FullscreenElement, doc: FullscreenDocument) {
  if (typeof element.requestFullscreen === 'function' && typeof doc.exitFullscreen === 'function' && doc.fullscreenEnabled !== false)
    return { enter: () => element.requestFullscreen(), exit: () => doc.exitFullscreen() };
  if (typeof element.webkitRequestFullscreen === 'function' && typeof doc.webkitExitFullscreen === 'function' && doc.webkitFullscreenEnabled !== false)
    return { enter: () => element.webkitRequestFullscreen!(), exit: () => doc.webkitExitFullscreen!() };
  return null;
}
export function fullscreenElement(doc: FullscreenDocument) { return doc.fullscreenElement || doc.webkitFullscreenElement || null; }
export function standaloneDisplay(navigator: Navigator & { standalone?: boolean }, standalone: boolean, fullscreen: boolean) {
  return navigator.standalone === true || standalone || fullscreen;
}

export function setupFullscreen(options: {
  game: HTMLElement; button: HTMLButtonElement; help: HTMLDialogElement;
  beforeHelp: () => void; afterHelp: () => void;
}) {
  const { game, button, help, beforeHelp, afterHelp } = options;
  const icon = button.innerHTML;
  const standalone = matchMedia('(display-mode: standalone)'), fullscreen = matchMedia('(display-mode: fullscreen)');
  let busy = false;
  const update = () => {
    const active = !!fullscreenElement(document);
    // Native fullscreen can also match display-mode: fullscreen. Keep its exit button.
    button.hidden = !active && standaloneDisplay(navigator, standalone.matches, fullscreen.matches);
    const supported = !!fullscreenAPI(game, document);
    const label = active ? 'Exit fullscreen' : supported ? 'Enter fullscreen' : 'Play without browser bars';
    button.setAttribute('aria-label', label); button.title = label;
    button.innerHTML = supported || active ? icon : '<span aria-hidden="true">APP</span>';
    if (supported || active) {
      button.setAttribute('aria-pressed', String(active)); button.removeAttribute('aria-haspopup');
    } else { button.removeAttribute('aria-pressed'); button.setAttribute('aria-haspopup', 'dialog'); }
    button.disabled = busy;
  };
  const showHelp = (rejected: boolean) => {
    if (help.open) return;
    beforeHelp();
    help.querySelector('#fullscreen-help-title')!.textContent = rejected ? 'Fullscreen was blocked.' : 'Play without browser bars.';
    help.querySelector('#fullscreen-help-copy')!.textContent = rejected
      ? 'The browser declined this fullscreen request. You can close this guide and try again, or open ORBIT as a Home Screen web app.'
      : 'This browser does not offer fullscreen for this game. On iPhone, open ORBIT from the Home Screen to play without the normal browser bars.';
    help.showModal();
  };
  button.addEventListener('click', async () => {
    if (busy) return;
    const api = fullscreenAPI(game, document);
    if (!api) { showHelp(false); return; }
    busy = true; update();
    try { if (fullscreenElement(document)) await api.exit(); else await api.enter(); }
    catch { showHelp(true); }
    finally { busy = false; update(); }
  });
  help.querySelector('#fullscreen-help-close')!.addEventListener('click', () => help.close());
  help.addEventListener('close', afterHelp);
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, update);
  // Older prefixed implementations signal failure by event rather than a rejected promise.
  for (const event of ['fullscreenerror', 'webkitfullscreenerror']) document.addEventListener(event, () => showHelp(true));
  standalone.addEventListener('change', update); fullscreen.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  update();
}
