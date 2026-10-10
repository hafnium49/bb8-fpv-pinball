import './style.css';
import { cabinetDisplay } from './ui/cabinet-display';
import { rankedScores, readScores, saveRun } from './ui/local-scores';
import { PlayInput, pauseOnWindowBlur } from './ui/play-input';
import { PinballSimulation } from './physics/simulation';
import { PinballView } from './render/view';
import { HeadLossCamera, HEAD_LOSS_CAPTION } from './render/head-loss';
import { GameAudio } from './ui/audio';
import { SoundDirector, type SoundCue } from './ui/sound-director';
import voiceUrl from './assets/droid-beeps.wav?inline';

const referenceEnabled = new URLSearchParams(location.search).get('table') !== 'orbit';
const circuitEnabled = referenceEnabled || new URLSearchParams(location.search).get('circuit') === '1';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main id="game" class="intro-state" tabindex="-1" aria-label="ORBIT FPV pinball game">
    <div id="viewport"></div>
    <aside id="ranking-panel" class="cabinet-panel ranking-panel" aria-label="Local pinball rankings">
      <h2 class="cabinet-heading">RANKING</h2>
      <section class="steel-frame ranking-frame"><h3>LOCAL TOP 10 <small>this browser</small></h3><ol id="rankings" class="score-list"></ol></section>
      <section class="steel-frame recent-frame"><h3>RECENT GAMES</h3><ol id="recent-runs" class="score-list"></ol><p class="panel-footnote">Finish a game to record your score.</p></section>
    </aside>
    <header class="topbar">
      <a class="wordmark" href="./" aria-label="ORBIT home"><span class="orbit-mark">◎</span><strong>ORBIT <span class="pinball-title">PINBALL</span></strong><span class="brand-note">ORBITAL ARCADE</span></a>
      <div id="hud" class="hud" hidden>
        <div class="score-block"><span class="eyebrow">SCORE</span><output id="score" aria-live="off">00000</output></div>
        <div class="ball-block"><span class="eyebrow">BALLS</span><span id="balls" aria-label="Three balls remaining">● ● ●</span></div>
        <div id="display-status" class="display-status"><span id="hint">HOLD SPACE TO LAUNCH</span><div id="toast" role="status" aria-live="polite"></div></div>
      </div>
      <div class="reference-console">
        <section class="steel-frame reactor-bank" aria-label="Jet bumper reactor lights"><div class="reactor-window warm"><span>★</span></div><div class="reactor-window ${referenceEnabled ? 'warm' : 'cool'}"><span>★</span></div><div class="reactor-window ${referenceEnabled ? 'cool' : 'warm'}"><span>★</span></div><p>JET REACTORS · 100 POINTS</p></section>
        <section class="steel-frame machine-data" aria-label="Cabinet game statistics"><dl><dt>HIGH SCORE</dt><dd id="panel-best">0</dd><dt>BALL</dt><dd id="panel-ball">1 / 3</dd><dt>TABLE</dt><dd>${referenceEnabled ? 'HYPERSPACE' : circuitEnabled ? 'CIRCUIT' : 'CLASSIC'}</dd><dt>${referenceEnabled ? 'RAMPS / SUBWAYS' : 'CIRCUITS'}</dt><dd id="panel-circuits">0</dd></dl></section>
        <section class="steel-frame cabinet-guide"><h3>CONTROLS</h3><dl><dt><kbd>A</kbd> <kbd>←</kbd></dt><dd>Left flipper</dd><dt><kbd>D</kbd> <kbd>→</kbd></dt><dd>Right flipper</dd><dt><kbd>SPACE</kbd></dt><dd>Hold to launch</dd><dt><kbd>ESC</kbd></dt><dd>Pause</dd></dl><h3>SCORING</h3><dl><dt>Jet bumpers</dt><dd>100</dd><dt>Target banks</dt><dd>${referenceEnabled ? '150 / 300' : '250'}</dd>${referenceEnabled ? '<dt>Left / Wire / Sky</dt><dd>1,000 / 1,500 / 2,500</dd><dt>Gravity well</dt><dd>5,000</dd>' : circuitEnabled ? '<dt>Full circuit</dt><dd>750</dd>' : ''}</dl><p>Stable first-person play.<br/>Three balls. One more orbit.</p></section>
      </div>
      <div id="desktop-start-slot" class="desktop-start-slot"></div>
      <div class="top-actions"><button id="quality" class="icon-button" aria-label="Change graphics quality" aria-pressed="false" disabled>FX HIGH</button><button id="sound" class="icon-button" aria-label="Enable sound" aria-pressed="false">SOUND OFF</button><button id="pause" class="icon-button" aria-label="Pause game"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button></div>
    </header>
    <aside id="droid-comms" class="droid-comms sr-only" role="status" aria-live="polite" aria-atomic="true"><span class="comms-label">◎ BALL COMMS</span><span id="droid-line"></span></aside>
    <section id="intro" class="intro-panel">
      <div id="intro-content" class="intro-content"><span class="eyebrow amber"><i class="live-dot"></i> SECTOR 07 / ${referenceEnabled ? 'HYPERSPACE COURSE' : circuitEnabled ? 'ELEVATED CIRCUIT' : 'ORBITAL ARCADE'}</span><h1>Be the<br/><em>ball.</em></h1><p>${referenceEnabled ? 'Three ramps. Two playfields.<br/>Ride the subway. Reach the upper deck.<br/>A whole cabinet, in first person.' : circuitEnabled ? 'Climb the ramp. Cross the wire bridge.<br/>Ride the tunnel back to the flippers.<br/>One full circuit. +750.' : 'Light up the reactors. Ride the ricochet.<br/>A neon pinball universe, seen from<br class="desktop-break"/> the inside.'}</p><button id="start" class="primary" disabled>INITIALIZING PHYSICS <span>↗</span></button><div id="intro-feedback"></div><div id="intro-best"><span id="best-panel" class="best">PERSONAL BEST <b id="best-score">00000</b></span></div><div class="intro-note"><span>STABLE FPV</span><span>REAL PHYSICS</span><span>3 BALLS</span></div><a id="table-variant" class="text-button" ${referenceEnabled ? 'hidden' : ''} href="${circuitEnabled ? '?table=orbit' : '?table=orbit&circuit=1'}">${circuitEnabled ? 'Classic table' : 'Try elevated circuit'} <span>↗</span></a><button id="show-controls" class="text-button">How to play <span>+</span></button><div id="instructions" class="instructions" hidden><div id="audio-settings" class="audio-settings"><label for="music-volume">Music <output id="music-value" aria-live="off">60%</output></label><input id="music-volume" type="range" min="0" max="100" value="60" aria-label="Music volume"/><small>Music at 0% keeps droid and cabinet sounds.</small></div><p><b>A / ←</b> left flipper · <b>D / →</b> right flipper</p><p>Hold <b>Space</b>, then release to launch. <b>Esc</b> pauses.</p><p>Touch buttons support both flippers at once. FPV keeps your head steady. About one launch in twenty briefly spins: BB-8 lost its head! Reduced-motion settings keep FPV steady.</p>${referenceEnabled ? '<p>Left, wire and sky ramps score <b>1,000 / 1,500 / 2,500</b>. The sky ramp reaches the upper deck. A/D operate both flipper pairs. Subway holes return the ball through the cabinet.</p>' : circuitEnabled ? '<p>Aim up the left ramp. Cross the bridge and tunnel for <b>+750</b>, then flip the right return. Weak shots can roll back.</p>' : ''}<p><b>FX HIGH</b> adds glow and shadows. <b>FX ECO</b> reduces graphics work. Resolution adapts automatically for smooth play; controls stay sharp.</p></div></div>
      <div class="intro-index"><span>01 / ORBITAL TABLE <b>● SYSTEM ONLINE</b></span><span>FPV PINBALL / THREE BALLS · ONE ORBIT</span></div>
    </section>
    <div id="play-controls" class="play-controls" hidden>
      <button id="left" class="flipper-button" aria-label="Hold left flipper"><span class="flipper-icon">↖</span><b>LEFT FLIPPER</b><small>A / ←</small></button>
      <div class="launch-cluster"><button id="launch" aria-label="Hold then release to launch the ball"><span id="launch-label">LAUNCH</span><span class="charge-track"><span id="charge"></span></span></button></div>
      <button id="right" class="flipper-button" aria-label="Hold right flipper"><span class="flipper-icon">↗</span><b>RIGHT FLIPPER</b><small>D / →</small></button>
    </div>
    <section id="modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-copy" hidden><div class="modal-card"><span id="modal-kicker" class="eyebrow amber">TAKE A BREATHER</span><h2 id="modal-title">Paused.</h2><p id="modal-copy">Your orbit will be right here.</p><button id="resume" class="primary">BACK TO THE TABLE <span>↗</span></button><button id="restart" class="text-button">Start a new game</button><div id="modal-settings"><button id="dialog-sound" class="text-button">SOUND OFF</button></div><div id="modal-feedback"></div></div></section>
    <div id="loading-error" class="loading-error" role="alert" hidden></div>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reactorWindows = Array.from(document.querySelectorAll<HTMLElement>('.reactor-window'));
const reactorUntil = [0, 0, 0], reactorLit = [false, false, false];
const audio = new GameAudio(voiceUrl), soundDirector = new SoundDirector();
const headLoss = new HeadLossCamera();
try { audio.setEnabled(localStorage.getItem('orbit-pinball-sound') === 'on'); } catch { /* Sound still works without storage. */ }
let sim: PinballSimulation, view: PinballView;
let best = 0;
try { best = Number(localStorage.getItem('orbit-pinball-best') || 0) || 0; } catch { /* Private browsing still plays. */ }
$('best-score').textContent = String(best).padStart(5, '0');
let scores = readScores(null);
try { scores = readScores(localStorage.getItem('orbit-pinball-runs')); } catch {}
function renderRankings() {
  const top = rankedScores(scores, best), recent = [...scores].reverse().slice(0, 8);
  for (const [id, entries, count] of [['rankings', top, 10], ['recent-runs', recent, 8]] as const) {
    const nodes = Array.from({ length: count }, (_, i) => {
      const row = document.createElement('li'), label = document.createElement('span'), value = document.createElement('b'), entry = entries[i];
      label.textContent = entry ? entry.at ? (entry.course === 'reference' ? 'YOU · HYPER' : entry.circuit ? 'YOU · CIRCUIT' : 'YOU · CLASSIC') : 'PERSONAL BEST' : '—';
      value.textContent = entry ? entry.score.toLocaleString('en-US') : '—';
      row.append(label, value); return row;
    });
    $(id).replaceChildren(...nodes);
  }
  $('panel-best').textContent = best.toLocaleString('en-US');
}
renderRankings();
let toastUntil = 0, previousPhase = 'intro', last = performance.now();
let commsUntil = 0;
const coarseInput = matchMedia('(pointer: coarse)');
const desktopCabinet = matchMedia('(min-width: 1024px) and (min-height: 600px)');
function arrangeIntro() {
  const parent = desktopCabinet.matches ? $('desktop-start-slot') : $('intro');
  if ($('intro-content').parentElement !== parent) parent.append($('intro-content'));
}
arrangeIntro();
let displayCache = '';
let focusBeforeDialog: HTMLElement | null = null;
let playInput: PlayInput;
let lastPointerType = '';
try {
  const saved = localStorage.getItem('orbit-pinball-music-volume');
  if (saved !== null && saved.trim()) audio.setMusicVolume(Number(saved));
} catch { /* Music keeps its default when storage is unavailable. */ }
function updateMusic() {
  const value = Math.round(audio.musicVolume * 100);
  $<HTMLInputElement>('music-volume').value = String(value); $('music-value').textContent = `${value}%`;
}
updateMusic();
$('music-volume').addEventListener('input', () => {
  audio.setMusicVolume(Number($<HTMLInputElement>('music-volume').value) / 100); updateMusic();
  try { localStorage.setItem('orbit-pinball-music-volume', String(audio.musicVolume)); } catch {}
});
function setDialog(open: boolean) {
  const modal = $('modal');
  if (open && modal.hidden) focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = !open;
  for (const node of Array.from($('game').children)) if (node instanceof HTMLElement && node !== modal) node.inert = open;
  if (open) {
    $('modal-settings').append($('best-panel'), $('audio-settings')); $('modal-feedback').append($('toast'));
    if (!document.hidden) ($('resume').hidden ? $('restart') : $('resume')).focus();
  } else {
    $('intro-best').append($('best-panel')); $('instructions').prepend($('audio-settings')); $('display-status').append($('toast'));
    if (focusBeforeDialog?.isConnected && !focusBeforeDialog.closest('[hidden]') && !document.hidden) focusBeforeDialog.focus();
    focusBeforeDialog = null;
  }
}
function refreshDisplay() {
  const key = `${sim.phase}:${sim.paused}:${sim.score}:${sim.balls}:${sim.charge > 0}:${sim.route.active}:${sim.route.phase}:${sim.route.completions}:${sim.reference?.name}:${coarseInput.matches}:${desktopCabinet.matches}`;
  if (key === displayCache) return;
  const d = cabinetDisplay({ phase: sim.phase, paused: sim.paused, score: sim.score, balls: sim.balls, charge: sim.charge, route: sim.route, circuit: circuitEnabled, reference: referenceEnabled, routeName: sim.reference?.name, coarse: coarseInput.matches });
  displayCache = key; $('hud').hidden = !d.visible && !desktopCabinet.matches;
  $('score').textContent = d.score; $('score').classList.toggle('long-score', d.score.length > 6);
  $('balls').textContent = d.balls; $('balls').setAttribute('aria-label', d.ballLabel); $('hint').textContent = d.status;
  $('panel-ball').textContent = `${Math.min(3, Math.max(1, 4 - sim.balls))} / 3`;
  $('panel-circuits').textContent = String(sim.route.completions);
}

const leftButton = $('left'), rightButton = $('right'), launchButton = $<HTMLButtonElement>('launch');
const chargeBar = $('charge'), launchLabel = $('launch-label');
let uiLeft = false, uiRight = false, uiLaunch = false, uiCharge = -1, uiDisabled: boolean | undefined;
function refreshControls() {
  const { left, right, launch } = sim.controls;
  const charge = Math.round(sim.charge * 1000), disabled = sim.phase !== 'ready' || sim.paused;
  if (left !== uiLeft) { uiLeft = left; leftButton.classList.toggle('pressed', left); }
  if (right !== uiRight) { uiRight = right; rightButton.classList.toggle('pressed', right); }
  if (launch !== uiLaunch) { uiLaunch = launch; launchLabel.textContent = launch ? 'CHARGING' : 'LAUNCH'; }
  if (charge !== uiCharge) { uiCharge = charge; chargeBar.style.width = `${charge / 10}%`; }
  if (disabled !== uiDisabled) { uiDisabled = disabled; launchButton.disabled = disabled; }
}


function clearComms() {
  const region = $('droid-comms');
  if (region.classList.contains('sr-only')) return;
  region.classList.add('sr-only'); region.setAttribute('aria-live', 'polite'); $('droid-line').textContent = '';
  $('left').classList.remove('warning'); $('right').classList.remove('warning');
}
function showComms(cue: SoundCue) {
  if (!cue.caption) return;
  // An urgent instruction keeps its reading window even if a later reaction
  // is forced visually (for example the lost-head caption with muted audio).
  const region = $('droid-comms');
  if (cue.kind !== 'warning' && !region.classList.contains('sr-only') && region.classList.contains('urgent') && performance.now() < commsUntil) return;
  // The region stays in the accessibility tree between cues. Set priority
  // before changing text so urgent advice can interrupt ordinary announcements.
  $('droid-comms').setAttribute('aria-live', cue.kind === 'warning' ? 'assertive' : 'polite');
  $('droid-line').textContent = cue.caption; $('droid-comms').classList.remove('sr-only');
  $('droid-comms').classList.toggle('urgent', cue.kind === 'warning');
  $('left').classList.toggle('warning', cue.kind === 'warning' && (cue.voice === 'left' || cue.voice === 'both'));
  $('right').classList.toggle('warning', cue.kind === 'warning' && (cue.voice === 'right' || cue.voice === 'both'));
  // The spin follows simulation time, which can lag wall time on a slow device.
  // Its end/cancellation clears this caption; warnings keep their own timeout.
  commsUntil = cue.kind === 'head-loss' ? Infinity : performance.now() + (cue.kind === 'warning' ? 1400 : 1800);
}

function toast(message: string, seconds = 1.6) {
  if (!sim || sim.phase === 'intro') $('intro-feedback').append($('toast'));
  $('toast').textContent = message; $('toast').classList.add('visible'); $('display-status').classList.toggle('has-toast', $('modal').hidden); toastUntil = performance.now() + seconds * 1000;
}
function updateSound() {
  $('sound').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
  $('dialog-sound').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
  $('dialog-sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').setAttribute('aria-label', audio.enabled ? 'Disable sound' : 'Enable sound');
  try { localStorage.setItem('orbit-pinball-sound', audio.enabled ? 'on' : 'off'); } catch { /* Private browsing still plays. */ }
}
let soundChange = 0;
async function activateSound(confirm = false) {
  if (!audio.enabled) return;
  const change = soundChange;
  const ready = await audio.unlock();
  if (change !== soundChange || !audio.enabled) return;
  if (!ready) {
    ++soundChange; audio.setEnabled(false); updateSound();
    toast('Sound could not start · tap SOUND to retry', 4);
  } else if (confirm) {
    soundDirector.resume();
    audio.tone(660, 0.22, 'triangle', 0.05, 990);
    toast('SOUND ON · check media volume', 3);
  }
}
updateSound();
function toggleSound() {
  ++soundChange; audio.setEnabled(!audio.enabled); updateSound();
  if (!audio.enabled) { toast('SOUND OFF'); return; }
  void activateSound(true);
}
$('sound').addEventListener('click', toggleSound);
$('dialog-sound').addEventListener('click', toggleSound);
function begin() {
  sim.start(); soundDirector.reset(); audio.reset(); clearComms(); headLoss.reset(); view.mode = 'fpv'; view.heading = 0; view.resetEffects(); void activateSound();
  displayCache = ''; previousPhase = 'ready'; playInput.clear();
  setDialog(false); $('toast').classList.remove('visible'); toastUntil = 0;
  $('intro').hidden = true; $('desktop-start-slot').hidden = true; $('game').classList.remove('intro-state'); $('game').focus(); refreshDisplay();
  for (const id of ['hud', 'play-controls']) $(id).hidden = false;
  toast('Hold SPACE, then release to launch');
}
function showPause() {
  audio.setPaused(true); clearComms(); headLoss.reset(); if (view) view.mode = 'fpv';
  if (sim.phase === 'intro' || sim.phase === 'over') return;
  sim.paused = true; playInput.clear(); sim.releaseControls();
  $('modal-kicker').textContent = 'TAKE A BREATHER'; $('modal-title').textContent = 'Paused.';
  $('modal-copy').textContent = 'Your orbit will be right here.'; $('resume').hidden = false;
  $('restart').textContent = 'Start a new game'; setDialog(true); refreshDisplay();
}
function resume() { sim.paused = false; sim.releaseControls(); soundDirector.resume(); audio.setPaused(false); setDialog(false); refreshDisplay(); last = performance.now(); void activateSound(); }
function gameOver() {
  if (sim.score > best) { best = sim.score; try { localStorage.setItem('orbit-pinball-best', String(best)); } catch {} }
  $('best-score').textContent = String(best).padStart(5, '0');
  scores = saveRun(scores, sim.score, Date.now(), circuitEnabled, referenceEnabled ? 'reference' : undefined);
  try { localStorage.setItem('orbit-pinball-runs', JSON.stringify(scores)); } catch {}
  renderRankings();
  $('modal-kicker').textContent = 'ORBIT COMPLETE'; $('modal-title').textContent = String(sim.score).padStart(5, '0');
  $('modal-copy').textContent = 'Three balls. One more orbit?'; $('resume').hidden = true;
  $('restart').textContent = 'PLAY AGAIN ↗'; playInput.clear(); setDialog(true); refreshDisplay();
}
function pointerButton(id: string, key: 'left' | 'right' | 'launch') {
  const button = $<HTMLButtonElement>(id);
  button.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); if (sim.paused || sim.phase === 'intro' || sim.phase === 'over') return;
    lastPointerType = e.pointerType;
    try { button.setPointerCapture(e.pointerId); } catch { /* Global release handlers cover unavailable capture. */ }
    playInput.holdPointer(e.pointerId, key); void activateSound();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    button.addEventListener(name, e => playInput.releasePointer(e.pointerId));
  button.addEventListener('contextmenu', e => e.preventDefault());
}

async function boot() {
  try {
    sim = await PinballSimulation.create({ circuit: circuitEnabled, course: referenceEnabled ? 'reference' : 'orbit' }); playInput = new PlayInput(sim.controls); view = new PinballView($('viewport'), circuitEnabled, referenceEnabled);
    await view.warmup();
    // A resize can occur while physics and shaders initialize, before listeners exist.
    arrangeIntro(); view.resize();
    const updateQuality = () => {
      $('quality').textContent = view.highQuality ? 'FX HIGH' : 'FX ECO';
      $('quality').setAttribute('aria-pressed', String(view.highQuality));
      $('quality').setAttribute('aria-label', view.highQuality ? 'Enable Eco graphics' : 'Enable High graphics');
    };
    updateQuality(); $<HTMLButtonElement>('quality').disabled = false;
    $('quality').addEventListener('click', () => {
      view.setQuality(!view.highQuality); updateQuality();
      toast(view.highQuality ? 'HIGH · glow + dynamic shadows' : 'ECO · lighter graphics');
    });
    $('start').textContent = 'ENTER THE TABLE ↗'; $<HTMLButtonElement>('start').disabled = false;
    $('start').addEventListener('click', begin);
    $('resume').addEventListener('click', resume); $('restart').addEventListener('click', begin);
    $('pause').addEventListener('click', () => sim.paused ? resume() : showPause());
    $('show-controls').addEventListener('click', () => { $('instructions').hidden = !$('instructions').hidden; });
    $('fullscreen').addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('game').requestFullscreen(); }
      catch { toast('Fullscreen is unavailable in this browser'); }
    });
    pointerButton('left', 'left'); pointerButton('right', 'right'); pointerButton('launch', 'launch');
    $('viewport').addEventListener('pointerdown', () => { if (!sim.paused) $('game').focus(); });
    window.addEventListener('pointerdown', e => { lastPointerType = e.pointerType; });
    window.addEventListener('keydown', e => {
      lastPointerType = 'keyboard';
      if (!$('modal').hidden && e.code === 'Tab') {
        const controls = Array.from($('modal').querySelectorAll<HTMLElement>('button:not([hidden]), input'))
          .filter(el => !el.hasAttribute('disabled'));
        const first = controls[0], end = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end?.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first?.focus(); }
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault(); if (sim.paused) resume(); else showPause(); return;
      }
      if (sim.paused || sim.phase === 'intro' || sim.phase === 'over') return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const hold = target?.closest<HTMLButtonElement>('#left, #right, #launch');
      if (hold && ['Space', 'Enter'].includes(e.code)) {
        e.preventDefault(); if (hold.disabled) return;
        const key = hold.id === 'left' ? 'left' : hold.id === 'right' ? 'right' : 'launch';
        playInput.holdKey(e.code, key); void activateSound(); return;
      }
      if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (!hold && target?.closest('button, a') && ['Space', 'Enter'].includes(e.code)) return;
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space'].includes(e.code)) return;
      void activateSound();
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') playInput.holdKey(e.code, 'left');
      if (e.code === 'KeyD' || e.code === 'ArrowRight') playInput.holdKey(e.code, 'right');
      if (e.code === 'Space') playInput.holdKey(e.code, 'launch');
    });
    window.addEventListener('keyup', e => {
      playInput.releaseKey(e.code);
    });
    for (const name of ['pointerup', 'pointercancel'] as const)
      window.addEventListener(name, e => playInput.releasePointer(e.pointerId));
    window.addEventListener('blur', () => {
      if (pauseOnWindowBlur(document.hidden, coarseInput.matches, lastPointerType)) showPause();
      else playInput.clearKeyboard();
    });
    window.addEventListener('pagehide', showPause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) showPause(); else if (!$('modal').hidden) ($('resume').hidden ? $('restart') : $('resume')).focus(); });
    window.addEventListener('resize', () => { arrangeIntro(); view.resize(); });
    view.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); showPause(); toast('Graphics paused · waiting for recovery', 20); });
    view.renderer.domElement.addEventListener('webglcontextrestored', () => { toast('Graphics restored · resume when ready'); });

    // A development-only inspection hook supports browser QA without changing the production UI.
    if (import.meta.env.DEV) Object.assign(window, { orbitDebug: { sim, view, audio, soundDirector, headLoss, begin } });
    requestAnimationFrame(frame);
  } catch (error) {
    $('loading-error').hidden = false;
    $('loading-error').textContent = 'Unable to start the 3D table. Try a browser with WebGL enabled, then reload.';
    console.error(error);
  }
}

function frame(now: number) {
  const frameMs = Math.max(0, now - last), dt = Math.min(frameMs / 1000, 0.1); last = now;
  sim.update(dt);
  const cameraFrame = headLoss.update(sim, sim.events, view.effects.reducedMotion);
  view.mode = cameraFrame.mode;
  if (cameraFrame.ended && $('droid-line').textContent === HEAD_LOSS_CAPTION) clearComms();
  refreshDisplay();
  refreshControls();
  if (sim.phase !== previousPhase) {
    if (sim.phase === 'draining') toast('BALL LOST · next ball ready shortly');
    if (sim.phase === 'over') gameOver();
    previousPhase = sim.phase;
  }
  for (const e of sim.events) {
    if (e.type === 'bumper') { toast(`+${e.points} · BUMPER`, 0.8); reactorUntil[e.index] = now + 350; }
    if (e.type === 'target') toast(`+${e.points} · TARGET`, 0.8);
    if (e.type === 'ramp') toast(`${e.name} +${e.points.toLocaleString()}`, 1.5);
    if (e.type === 'circuit') toast('CIRCUIT +750 · RIGHT FLIPPER NEXT', 1.5);
  }
  reactorWindows.forEach((window, i) => {
    const lit = now < reactorUntil[i];
    if (lit !== reactorLit[i]) { reactorLit[i] = lit; window.classList.toggle('hit', lit); }
  });
  const soundFrame = soundDirector.update(sim, sim.events);
  if (cameraFrame.started) soundFrame.cues.unshift({ kind: 'head-loss', voice: 'head-loss', strength: 1, priority: 85, caption: HEAD_LOSS_CAPTION });
  audio.update(soundFrame);
  for (const cue of soundFrame.cues) {
    const vocalized = audio.play(cue);
    // Critical instructions remain visible when the player chooses mute.
    const headCaption = $('droid-line').textContent === HEAD_LOSS_CAPTION && headLoss.mode === 'spin';
    if (cue.caption && (vocalized || cue.kind === 'warning' || cue.kind === 'head-loss')
      && (!headCaption || cue.kind === 'warning' || cue.kind === 'head-loss')) showComms(cue);
  }
  if (now > commsUntil && !sim.paused) clearComms();
  if (now > toastUntil) { $('toast').classList.remove('visible'); $('display-status').classList.remove('has-toast'); }
  else $('display-status').classList.toggle('has-toast', $('modal').hidden);
  // Submit expensive graphics after input feedback and sound scheduling.
  view.render(sim, dt, frameMs);
  sim.events.length = 0;
  requestAnimationFrame(frame);
}

void boot();
