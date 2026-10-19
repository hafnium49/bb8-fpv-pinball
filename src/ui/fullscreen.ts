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

/** Native dialog arrived after WebGL 2 on iOS. Keep the guide usable on those browsers. */
export function setupHelpDialog(help: HTMLDialogElement, afterClose: () => void) {
  const native = typeof help.showModal === 'function' && typeof help.close === 'function';
  let overlay: HTMLDivElement | null = null;
  let previous: Array<[HTMLElement, string | null]> = [];
  const heading = help.querySelector<HTMLElement>('[autofocus]')!;
  const close = () => {
    if (!help.open) return;
    if (native) { help.close(); return; }
    help.open = false; help.removeAttribute('open');
    overlay!.before(help); overlay!.remove(); overlay = null;
    for (const [node, value] of previous) {
      if (value === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', value);
    }
    previous = []; afterClose();
  };
  if (native) help.addEventListener('close', afterClose);
  else {
    help.setAttribute('role', 'dialog'); help.setAttribute('aria-modal', 'true');
    // Capture before game shortcuts: closing with Escape must not resume play.
    window.addEventListener('keydown', event => {
      if (!help.open) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = Array.from(help.querySelectorAll<HTMLElement>('button, [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }, true);
    document.addEventListener('focusin', event => {
      if (help.open && !help.contains(event.target as Node)) heading.focus();
    });
  }
  return {
    close,
    show: () => {
      if (native) { help.showModal(); return; }
      overlay = document.createElement('div'); overlay.className = 'fullscreen-help-overlay'; overlay.id = 'fullscreen-help-overlay';
      help.before(overlay); overlay.append(help);
      previous = Array.from(overlay.parentElement!.children)
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay)
        .map(node => [node, node.getAttribute('aria-hidden')]);
      for (const [node] of previous) node.setAttribute('aria-hidden', 'true');
      help.open = true; help.setAttribute('open', ''); heading.focus();
    },
  };
}

export function setupFullscreen(options: {
  game: HTMLElement; button: HTMLButtonElement; help: HTMLDialogElement;
  beforeHelp: () => void; afterHelp: () => void;
}) {
  const { game, button, help, beforeHelp, afterHelp } = options;
  const dialog = setupHelpDialog(help, afterHelp);
  const icon = button.innerHTML;
  const standalone = matchMedia('(display-mode: standalone)'), fullscreen = matchMedia('(display-mode: fullscreen)');
  let busy = false;
  let automaticRequest = false;
  const update = () => {
    const active = !!fullscreenElement(document);
    // Native fullscreen can also match display-mode: fullscreen. Keep its exit button.
    const installed = !active && standaloneDisplay(navigator, standalone.matches, fullscreen.matches);
    game.dataset.displayMode = active ? 'fullscreen' : installed ? 'standalone' : 'browser';
    game.classList.toggle('immersive-play', active || installed);
    button.hidden = installed;
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
      ? 'The browser declined this fullscreen request. You can close this guide and try again, or open Be the Ball 8 as a Home Screen web app.'
      : 'This browser does not offer fullscreen for this game. On iPhone, open Be the Ball 8 from the Home Screen to play without the normal browser bars.';
    dialog.show();
  };
  button.addEventListener('click', async () => {
    if (busy) return;
    automaticRequest = false;
    const api = fullscreenAPI(game, document);
    if (!api) { showHelp(false); return; }
    busy = true; update();
    try { if (fullscreenElement(document)) await api.exit(); else await api.enter(); }
    catch { showHelp(true); }
    finally { busy = false; update(); }
  });
  help.querySelector('#fullscreen-help-close')!.addEventListener('click', dialog.close);
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, update);
  // Older prefixed implementations signal failure by event rather than a rejected promise.
  for (const event of ['fullscreenerror', 'webkitfullscreenerror']) document.addEventListener(event, () => { if (!automaticRequest) showHelp(true); });
  standalone.addEventListener('change', update); fullscreen.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  update();
  return {
    // Called directly from the Start tap, before any await consumes user activation.
    // A denied/unsupported request must never cover the game with an install guide.
    enterForPlay: () => {
      if (busy || fullscreenElement(document) || standaloneDisplay(navigator, standalone.matches, fullscreen.matches)) return;
      const api = fullscreenAPI(game, document);
      if (!api) return;
      busy = true; automaticRequest = true; update();
      try { Promise.resolve(api.enter()).catch(() => {}).finally(() => { busy = false; update(); }); }
      catch { busy = false; update(); }
    },
  };
}

