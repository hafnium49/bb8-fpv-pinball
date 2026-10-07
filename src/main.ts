import './style.css';
import { PinballSimulation } from './physics/simulation';
import { PinballView } from './render/view';
import { HeadLossCamera, HEAD_LOSS_CAPTION, HEAD_LOSS_SECONDS } from './render/head-loss';
import { drawMinimap } from './ui/minimap';
import { GameAudio } from './ui/audio';
import { SoundDirector, type SoundCue } from './ui/sound-director';
import voiceUrl from './assets/droid-beeps.wav?inline';

const circuitEnabled = new URLSearchParams(location.search).get('circuit') === '1';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main id="game" aria-label="ORBIT FPV pinball game">
    <div id="viewport"></div>
    <header class="topbar">
      <a class="wordmark" href="./" aria-label="ORBIT home"><span class="orbit-mark">◎</span><strong>ORBIT</strong><span class="brand-note">ORBITAL ARCADE</span></a>
      <div class="top-actions"><span class="best">BEST <b id="best-score">00000</b></span><button id="quality" class="icon-button" aria-label="Change graphics quality" aria-pressed="false" disabled>FX HIGH</button><button id="sound" class="icon-button" aria-label="Enable sound" aria-pressed="false">SOUND OFF</button><button id="pause" class="icon-button" aria-label="Pause game"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button></div>
    </header>
    <div id="hud" class="hud" hidden>
      <div class="score-block"><span class="eyebrow">SCORE</span><output id="score">00000</output></div>
      <div class="ball-block"><span class="eyebrow">BALLS</span><span id="balls" aria-label="Three balls remaining">● ● ●</span></div>
    </div>
    <aside id="map-wrap" class="map-wrap" hidden><div class="map-label"><span>TABLE RADAR</span><i></i></div><canvas id="minimap" width="156" height="270" aria-label="Overhead map showing the ball, bumpers, and flippers"></canvas><div class="map-bottom">YOU ARE THE BALL</div></aside>
    <div id="toast" role="status" aria-live="polite"></div>
    <aside id="droid-comms" class="droid-comms sr-only" role="status" aria-live="polite" aria-atomic="true"><span class="comms-label">◎ BALL COMMS</span><span id="droid-line"></span></aside>
    <section id="intro" class="intro-panel">
      <div class="intro-content"><span class="eyebrow amber"><i class="live-dot"></i> SECTOR 07 / ${circuitEnabled ? 'ELEVATED CIRCUIT' : 'ORBITAL ARCADE'}</span><h1>Be the<br/><em>ball.</em></h1><p>${circuitEnabled ? 'Climb the ramp. Cross the wire bridge.<br/>Ride the tunnel back to the flippers.<br/>One full circuit. +750.' : 'Light up the reactors. Ride the ricochet.<br/>A neon pinball universe, seen from<br class="desktop-break"/> the inside.'}</p><button id="start" class="primary" disabled>INITIALIZING PHYSICS <span>↗</span></button><div class="intro-note"><span>STABLE FPV</span><span>REAL PHYSICS</span><span>3 BALLS</span></div><a id="table-variant" class="text-button" href="${circuitEnabled ? '?' : '?circuit=1'}">${circuitEnabled ? 'Classic table' : 'Try elevated circuit'} <span>↗</span></a><button id="show-controls" class="text-button">How to play <span>+</span></button><div id="instructions" class="instructions" hidden><p><b>A / ←</b> left flipper · <b>D / →</b> right flipper</p><p>Hold <b>Space</b>, then release to launch. <b>Esc</b> pauses.</p><p>Touch buttons support both flippers at once. The radar shows what is behind you. FPV keeps your head steady. About one launch in twenty briefly spins: BB-8 lost its head! Reduced-motion settings keep FPV steady.</p>${circuitEnabled ? '<p>Aim up the left ramp. Cross the bridge and tunnel for <b>+750</b>, then flip the right return. Weak shots can roll back.</p>' : ''}<p><b>FX HIGH</b> adds bloom and shadows. <b>FX ECO</b> reduces graphics work.</p></div></div>
      <div class="intro-index"><span>01 / ORBITAL TABLE <b>● SYSTEM ONLINE</b></span><span>FPV PINBALL / THREE BALLS · ONE ORBIT</span></div>
    </section>
    <div id="play-controls" class="play-controls" hidden>
      <button id="left" class="flipper-button" aria-label="Hold left flipper"><span class="flipper-icon">↖</span><b>LEFT FLIPPER</b><small>A / ←</small></button>
      <div class="launch-cluster"><span id="hint">HOLD SPACE TO LAUNCH</span><button id="launch" aria-label="Hold then release to launch the ball"><span id="launch-label">LAUNCH</span><span class="charge-track"><span id="charge"></span></span></button></div>
      <button id="right" class="flipper-button" aria-label="Hold right flipper"><span class="flipper-icon">↗</span><b>RIGHT FLIPPER</b><small>D / →</small></button>
    </div>
    <section id="modal" class="modal" hidden><div class="modal-card"><span id="modal-kicker" class="eyebrow amber">TAKE A BREATHER</span><h2 id="modal-title">Paused.</h2><p id="modal-copy">Your orbit will be right here.</p><button id="resume" class="primary">BACK TO THE TABLE <span>↗</span></button><button id="restart" class="text-button">Start a new game</button></div></section>
    <div id="loading-error" class="loading-error" role="alert" hidden></div>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new GameAudio(voiceUrl), soundDirector = new SoundDirector();
const headLoss = new HeadLossCamera();
try { audio.setEnabled(localStorage.getItem('orbit-pinball-sound') === 'on'); } catch { /* Sound still works without storage. */ }
let sim: PinballSimulation, view: PinballView;
let best = 0;
try { best = Number(localStorage.getItem('orbit-pinball-best') || 0) || 0; } catch { /* Private browsing still plays. */ }
$('best-score').textContent = String(best).padStart(5, '0');
let toastUntil = 0, previousPhase = 'intro', last = performance.now();
let commsUntil = 0;

function clearComms() {
  const region = $('droid-comms');
  if (region.classList.contains('sr-only')) return;
  region.classList.add('sr-only'); region.setAttribute('aria-live', 'polite'); $('droid-line').textContent = '';
  $('left').classList.remove('warning'); $('right').classList.remove('warning');
}
function showComms(cue: SoundCue) {
  if (!cue.caption) return;
  // The region stays in the accessibility tree between cues. Set priority
  // before changing text so urgent advice can interrupt ordinary announcements.
  $('droid-comms').setAttribute('aria-live', cue.kind === 'warning' ? 'assertive' : 'polite');
  $('droid-line').textContent = cue.caption; $('droid-comms').classList.remove('sr-only');
  $('droid-comms').classList.toggle('urgent', cue.kind === 'warning');
  $('left').classList.toggle('warning', cue.kind === 'warning' && (cue.voice === 'left' || cue.voice === 'both'));
  $('right').classList.toggle('warning', cue.kind === 'warning' && (cue.voice === 'right' || cue.voice === 'both'));
  commsUntil = performance.now() + (cue.kind === 'head-loss' ? HEAD_LOSS_SECONDS * 1000 : cue.kind === 'warning' ? 1400 : 1800);
}

function toast(message: string, seconds = 1.6) {
  $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + seconds * 1000;
}
function updateSound() {
  $('sound').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
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
$('sound').addEventListener('click', () => {
  ++soundChange; audio.setEnabled(!audio.enabled); updateSound();
  if (!audio.enabled) { toast('SOUND OFF'); return; }
  void activateSound(true);
});
function begin() {
  sim.start(); soundDirector.reset(); audio.reset(); clearComms(); headLoss.reset(); view.mode = 'fpv'; view.heading = 0; view.resetEffects(); void activateSound();
  $('score').textContent = '00000';
  $('intro').hidden = true; $('modal').hidden = true;
  for (const id of ['hud', 'map-wrap', 'play-controls']) $(id).hidden = false;
  toast('Hold SPACE, then release to launch');
}
function showPause() {
  audio.setPaused(true); clearComms(); headLoss.reset(); if (view) view.mode = 'fpv';
  if (sim.phase === 'intro' || sim.phase === 'over') return;
  sim.paused = true; sim.releaseControls();
  $('modal-kicker').textContent = 'TAKE A BREATHER'; $('modal-title').textContent = 'Paused.';
  $('modal-copy').textContent = 'Your orbit will be right here.'; $('resume').hidden = false;
  $('restart').textContent = 'Start a new game'; $('modal').hidden = false;
}
function resume() { sim.paused = false; sim.releaseControls(); soundDirector.resume(); audio.setPaused(false); $('modal').hidden = true; last = performance.now(); void activateSound(); }
function gameOver() {
  if (sim.score > best) { best = sim.score; try { localStorage.setItem('orbit-pinball-best', String(best)); } catch {} }
  $('best-score').textContent = String(best).padStart(5, '0');
  $('modal-kicker').textContent = 'ORBIT COMPLETE'; $('modal-title').textContent = String(sim.score).padStart(5, '0');
  $('modal-copy').textContent = 'Three balls. One more orbit?'; $('resume').hidden = true;
  $('restart').textContent = 'PLAY AGAIN ↗'; $('modal').hidden = false;
}
function pointerButton(id: string, key: 'left' | 'right' | 'launch') {
  const button = $<HTMLButtonElement>(id);
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); if (sim.paused || sim.phase === 'intro' || sim.phase === 'over') return;
    button.setPointerCapture(e.pointerId); sim.controls[key] = true; void activateSound();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { sim.controls[key] = false; });
}

async function boot() {
  try {
    sim = await PinballSimulation.create({ circuit: circuitEnabled }); view = new PinballView($('viewport'), circuitEnabled);
    const updateQuality = () => {
      $('quality').textContent = view.highQuality ? 'FX HIGH' : 'FX ECO';
      $('quality').setAttribute('aria-pressed', String(view.highQuality));
      $('quality').setAttribute('aria-label', view.highQuality ? 'Enable Eco graphics' : 'Enable High graphics');
    };
    updateQuality(); $<HTMLButtonElement>('quality').disabled = false;
    $('quality').addEventListener('click', () => {
      view.setQuality(!view.highQuality); updateQuality();
      toast(view.highQuality ? 'HIGH · bloom + dynamic shadows' : 'ECO · lighter graphics');
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
    window.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'Space', 'Escape'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') { if (sim.paused) resume(); else showPause(); return; }
      if (sim.paused || sim.phase === 'intro' || sim.phase === 'over') return;
      void activateSound();
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') sim.controls.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') sim.controls.right = true;
      if (e.code === 'Space') sim.controls.launch = true;
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') sim.controls.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') sim.controls.right = false;
      if (e.code === 'Space') sim.controls.launch = false;
    });
    window.addEventListener('blur', showPause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) showPause(); });
    window.addEventListener('resize', () => view.resize());
    view.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); showPause(); toast('Graphics paused · waiting for recovery', 20); });
    view.renderer.domElement.addEventListener('webglcontextrestored', () => { toast('Graphics restored · resume when ready'); });

    // A development-only inspection hook supports browser QA without changing the production UI.
    if (import.meta.env.DEV) Object.assign(window, { orbitDebug: { sim, view, audio, soundDirector, headLoss } });
    requestAnimationFrame(frame);
  } catch (error) {
    $('loading-error').hidden = false;
    $('loading-error').textContent = 'Unable to start the 3D table. Try a browser with WebGL enabled, then reload.';
    console.error(error);
  }
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  sim.update(dt);
  const cameraFrame = headLoss.update(sim, sim.events, view.effects.reducedMotion);
  view.mode = cameraFrame.mode;
  if (cameraFrame.ended && $('droid-line').textContent === HEAD_LOSS_CAPTION) clearComms();
  view.render(sim, dt);
  drawMinimap($<HTMLCanvasElement>('minimap'), sim, view.heading);
  $('score').textContent = String(sim.score).padStart(5, '0');
  $('balls').textContent = '● '.repeat(sim.balls) + '○ '.repeat(3 - sim.balls);
  $('balls').setAttribute('aria-label', `${sim.balls} balls remaining`);
  $('charge').style.width = `${sim.charge * 100}%`;
  $('left').classList.toggle('pressed', sim.controls.left); $('right').classList.toggle('pressed', sim.controls.right);
  $<HTMLButtonElement>('launch').disabled = sim.phase !== 'ready' || sim.paused;
  $('launch-label').textContent = sim.controls.launch ? 'CHARGING' : 'LAUNCH';
  if (sim.phase === 'ready') $('hint').textContent = 'HOLD SPACE · RELEASE TO LAUNCH';
  else if (sim.phase === 'playing') {
    const p = sim.position;
    $('hint').textContent = sim.route.active ? ({ ascent: 'RAMP · CLIMB TO THE BRIDGE', bridge: 'WIRE BRIDGE · KEEP YOUR ORBIT', tunnel: 'TUNNEL · RIGHT FLIPPER NEXT', return: 'RIGHT RETURN · FLIP WITH D / →', free: '' }[sim.route.phase])
      : p.z > 4 && p.x < 4.4 ? 'FLIPPERS APPROACHING · A / D' : circuitEnabled ? 'LEFT RAMP → CIRCUIT +750' : 'BUMPER +100 · TARGET +250';
  } else $('hint').textContent = sim.phase === 'draining' ? 'NEXT BALL INCOMING' : 'ORBIT COMPLETE';
  if (sim.phase !== previousPhase) {
    if (sim.phase === 'draining') toast('BALL LOST · next ball ready shortly');
    if (sim.phase === 'over') gameOver();
    previousPhase = sim.phase;
  }
  for (const e of sim.events) {
    if (e.type === 'bumper') toast('+100 · BUMPER', 0.8);
    if (e.type === 'target') toast('+250 · TARGET', 0.8);
    if (e.type === 'circuit') toast('CIRCUIT +750 · RIGHT FLIPPER NEXT', 1.5);
  }
  const soundFrame = soundDirector.update(sim, sim.events);
  if (cameraFrame.started) soundFrame.cues.unshift({ kind: 'head-loss', voice: 'ouch', strength: 1, priority: 85, caption: HEAD_LOSS_CAPTION });
  audio.update(soundFrame);
  for (const cue of soundFrame.cues) {
    const vocalized = audio.play(cue);
    // Critical instructions remain visible when the player chooses mute.
    const headCaption = $('droid-line').textContent === HEAD_LOSS_CAPTION && headLoss.mode === 'spin';
    if (cue.caption && (vocalized || cue.kind === 'warning' || cue.kind === 'head-loss')
      && (!headCaption || cue.kind === 'warning' || cue.kind === 'head-loss')) showComms(cue);
  }
  sim.events.length = 0;
  if (now > commsUntil && !sim.paused) clearComms();
  if (now > toastUntil) $('toast').classList.remove('visible');
  requestAnimationFrame(frame);
}

void boot();
