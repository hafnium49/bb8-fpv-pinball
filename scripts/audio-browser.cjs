const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
let server, browser, activePage;
const out = 'artifacts/audio';

(async () => {
  mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5178, watch: { ignored: () => true }, hmr: false } }); await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  const errors = [], cases = [], screenshots = [];
  for (const [name, options, search] of [
    ['desktop-classic', { viewport: { width: 1440, height: 900 } }, ''],
    ['mobile-circuit', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, '?circuit=1'],
  ]) {
    const context = await browser.newContext(options);
    // Observe real Web Audio output; the optional Safari session API is a stub
    // in Chromium, so this is not a physical iPhone mute-switch test.
    await context.addInitScript(() => {
      const Native = window.AudioContext;
      window.audioProbe = { contexts: [], voices: [], panners: [], peak: 0, sessionTypes: [] };
      Object.defineProperty(navigator, 'audioSession', { configurable: true,
        value: { set type(value) { window.audioProbe.sessionTypes.push(value); } } });
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args); window.audioProbe.contexts.push(this);
          const decode = this.decodeAudioData.bind(this);
          this.decodeAudioData = (...args) => window.audioProbe.failDecode ? Promise.reject(new Error('Injected voice decoding failure')) : decode(...args);
          const panner = this.createStereoPanner.bind(this);
          this.createStereoPanner = () => { const node = panner(); window.audioProbe.panners.push(node); return node; };
          const analyser = this.createAnalyser(); analyser.fftSize = 1024;
          const samples = new Float32Array(1024), gain = this.createGain.bind(this), oscillator = this.createOscillator.bind(this);
          this.createGain = () => {
            const node = gain(), connect = node.connect.bind(node);
            node.connect = (target, ...rest) => { if (target === this.destination) connect(analyser); return connect(target, ...rest); };
            return node;
          };
          this.createOscillator = () => {
            const node = oscillator(), start = node.start.bind(node);
            const setFrequency = node.frequency.setValueAtTime.bind(node.frequency); let initialFrequency;
            node.frequency.setValueAtTime = (value, ...rest) => { initialFrequency ??= value; return setFrequency(value, ...rest); };
            node.start = (...args) => { window.audioProbe.voices.push(initialFrequency); return start(...args); }; return node;
          };
          setInterval(() => { analyser.getFloatTimeDomainData(samples); for (const value of samples) window.audioProbe.peak = Math.max(window.audioProbe.peak, Math.abs(value)); }, 5);
        }
      };
    });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const boot = async () => {
      await page.goto(server.resolvedUrls.local[0] + search, { waitUntil: 'networkidle' });
      await page.locator('#start:not([disabled])').waitFor();
      // Keep real simulation/input active; avoid software-GPU stalls during
      // short audio envelopes. Restore rendering for each actual screenshot.
      await page.evaluate(() => { const { view, headLoss } = window.orbitDebug; headLoss.draw = () => 1; window.restoreAudioRender = view.render.bind(view); view.render = () => {}; });
    };
    const activate = locator => options.hasTouch ? locator.tap() : locator.click();
    console.log(`${name}: boot`); await boot(); assert.equal(await page.locator('#sound').textContent(), 'SOUND OFF');
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 0);
    await activate(page.locator('#sound'));
    await page.waitForFunction(() => window.audioProbe.peak > 0.001);
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.audioProbe.contexts[0].state), 'running');
    assert.ok(await page.evaluate(() => window.audioProbe.sessionTypes.includes('playback')));
    const confirmationPeak = await page.evaluate(() => window.audioProbe.peak);
    console.log(`${name}: real confirmation signal ${confirmationPeak}`);
    await activate(page.locator('#start'));
    await page.waitForFunction(() => document.querySelector('#droid-line').textContent === '[ready chirps]');
    assert.equal(await page.locator('#droid-comms').getAttribute('aria-live'), 'polite');
    assert.equal(await page.locator('[data-camera], #camera-controls').count(), 0);
    for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
    if (options.hasTouch) {
      const left = await page.locator('#left').boundingBox(), right = await page.locator('#right').boundingBox();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 }, { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 },
      ] });
      assert.deepEqual(await page.evaluate(() => [window.orbitDebug.sim.controls.left, window.orbitDebug.sim.controls.right]), [true, true]);
      await page.waitForFunction(() => window.audioProbe.voices.includes(130));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const launch = await page.locator('#launch').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: launch.x + launch.width / 2, y: launch.y + launch.height / 2, id: 7 }] });
      await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD');
      await page.waitForFunction(() => window.audioProbe.voices.includes(130));
      await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD');
      await page.keyboard.down('Space'); await page.waitForFunction(() => window.orbitDebug.sim.charge > 0.1); await page.keyboard.up('Space');
    }
    await page.waitForFunction(() => window.audioProbe.voices.includes(110));
    console.log(`${name}: flipper and launch tones`);
    await page.waitForFunction(() => window.orbitDebug.audio.diagnostics.voiceReady);
    const voiceReady = await page.evaluate(() => window.orbitDebug.audio.diagnostics.voiceReady);
    const warningPans = await page.evaluate(() => {
      const audio = window.orbitDebug.audio;
      return ['left', 'right', 'both', 'danger'].map(voice => {
        audio.reset(); const accepted = audio.play({ kind: 'warning', voice, priority: 100 });
        return { voice, accepted, pan: window.audioProbe.panners.at(-1).pan.value };
      });
    });
    assert.ok(warningPans.every(p => p.accepted));
    assert.ok(warningPans[0].pan < -0.6 && warningPans[1].pan > 0.6);
    assert.equal(warningPans[2].pan, 0); assert.equal(warningPans[3].pan, 0);
    // Exercise actual Rapier collisions while observing the real audio mixer.
    const place = async (position, velocity) => page.evaluate(({ position, velocity }) => {
      const { sim, audio, soundDirector } = window.orbitDebug;
      sim.start(); sim.launch(0.5); sim.events.length = 0; soundDirector.reset(); audio.reset(); audio.history.length = 0;
      sim.ball.setTranslation(position, true); sim.ball.setLinvel(velocity, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      window.audioProbe.peak = 0;
    }, { position, velocity });
    await place({ x: -4.8, y: 0.31, z: -2 }, { x: -9, y: 0, z: 0 });
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'wall'));
    await page.waitForFunction(() => window.audioProbe.peak > 0.001);
    const wallPeak = await page.evaluate(() => window.audioProbe.peak);
    await place({ x: -1.8, y: 0.305, z: -6.4 }, { x: 9, y: 0, z: 0 });
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'bumper'));
    await place({ x: -3.9, y: 0.305, z: 0 }, { x: -9, y: 0, z: 0 });
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'target'));
    console.log(`${name}: real wall, bumper and target reactions`);
    if (search) {
      await page.evaluate(async () => {
        const { frames } = await import('/src/physics/route-geometry.ts');
        const { sim, audio, soundDirector } = window.orbitDebug, f = frames[0];
        sim.start(); sim.launch(); sim.events.length = 0; soundDirector.reset(); audio.reset(); audio.history.length = 0;
        sim.ball.setTranslation({ x: f.c.x - f.tangent.x * 0.4, y: f.c.y, z: f.c.z - f.tangent.z * 0.4 }, true);
        sim.ball.setLinvel({ x: f.tangent.x * 20, y: 0, z: f.tangent.z * 20 }, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });
      await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'circuit'));
      const routeHistory = await page.evaluate(() => window.orbitDebug.audio.history);
      for (const kind of ['ascent', 'bridge', 'tunnel', 'circuit']) assert.ok(routeHistory.some(c => c.kind === kind), `Missing ${kind} sound`);
      assert.ok(routeHistory.some(c => c.kind === 'warning' && c.voice === 'right' && c.accepted));
      console.log(`${name}: live ramp/bridge/tunnel/return sound cues`);
    }
    // Select an episode deterministically through the controller's dev hook.
    // The probability itself is covered at the exact boundary by unit tests.
    await place({ x: -4, y: .305, z: -9 }, { x: 0, y: 0, z: 0 });
    await page.evaluate(() => {
      const { sim, headLoss } = window.orbitDebug; headLoss.reset(); headLoss.draw = () => 0;
      window.restoreSpinUpdate = sim.update.bind(sim); sim.update = () => {};
      sim.ball.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
      sim.events.push({ type: 'launch' });
    });
    await page.waitForFunction(() => window.orbitDebug.view.mode === 'spin');
    assert.equal(await page.locator('#droid-line').textContent(), 'Oh no, BB-8 lost its head!');
    assert.equal(await page.locator('#droid-comms').getAttribute('aria-live'), 'polite');
    assert.ok(await page.evaluate(() => window.orbitDebug.audio.history.some(c => c.kind === 'head-loss' && c.voice === 'ouch' && c.accepted)));
    await page.evaluate(() => { window.orbitDebug.view.render = window.restoreAudioRender; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const spinUp = await page.evaluate(() => window.orbitDebug.view.camera.matrixWorld.elements[5]);
    assert.ok(Math.abs(spinUp) < .1, 'Lost-head camera must inherit real ball rotation');
    await page.screenshot({ path: `${out}/${name}-head-loss.png`, timeout: 90000 }); screenshots.push(`${name}-head-loss.png`);
    const beganSpin = await page.evaluate(() => {
      const { sim, view } = window.orbitDebug; view.render = () => {}; sim.update = window.restoreSpinUpdate; return sim.time;
    });
    await page.waitForFunction(() => window.orbitDebug.view.mode === 'fpv');
    const spinDuration = await page.evaluate(start => window.orbitDebug.sim.time - start, beganSpin);
    assert.ok(spinDuration >= 3 && spinDuration <= 3.2, `Unexpected spin lifetime ${spinDuration}`);
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.phase), 'playing');
    assert.notEqual(await page.locator('#droid-line').textContent(), 'Oh no, BB-8 lost its head!');
    const startSpin = async () => {
      await place({ x: -4, y: .305, z: -9 }, { x: 0, y: 0, z: 0 });
      await page.evaluate(() => { const { sim, headLoss } = window.orbitDebug; headLoss.reset(); headLoss.draw = () => 0; sim.events.push({ type: 'launch' }); });
      await page.waitForFunction(() => window.orbitDebug.view.mode === 'spin');
    };
    await startSpin(); await activate(page.locator('#pause'));
    assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
    await activate(page.locator('#resume'));
    assert.equal(await page.evaluate(() => window.orbitDebug.headLoss.mode), 'fpv');
    await startSpin(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.orbitDebug.view.mode === 'fpv');
    await place({ x: -4, y: .305, z: -9 }, { x: 0, y: 0, z: 0 });
    await page.evaluate(() => {
      const { sim, headLoss } = window.orbitDebug; window.headLossDraws = 0;
      headLoss.draw = () => { window.headLossDraws++; return 0; }; sim.events.push({ type: 'launch' });
    });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.headLossDraws), 0);
    assert.equal(await page.evaluate(() => window.orbitDebug.view.mode), 'fpv');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await place({ x: -1.7, y: .305, z: 2 }, { x: 0, y: 0, z: 4 });
    await page.evaluate(() => { const { sim, headLoss } = window.orbitDebug; headLoss.reset(); headLoss.draw = () => 0; sim.events.push({ type: 'launch' }); });
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'warning' && c.accepted));
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.diagnostics.priority), 100);
    assert.equal(await page.locator('#droid-line').textContent(), 'Left flipper!');
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.play({ kind: 'head-loss', voice: 'ouch', strength: 1, priority: 85 })), false);
    await page.evaluate(() => { window.orbitDebug.headLoss.reset(); window.orbitDebug.headLoss.draw = () => 1; });
    console.log(`${name}: lost-head rotation, caption, beep, automatic return, pause and live reduced-motion checks pass`);
    // Interrupt a flavour whistle with an urgent, forecasted left warning.
    await place({ x: -1.7, y: 0.305, z: 2 }, { x: 0, y: 0, z: 4 });
    await page.evaluate(() => {
      const { audio, soundDirector } = window.orbitDebug;
      audio.reset(); audio.history.length = 0; soundDirector.resume();
      audio.play({ kind: 'tunnel', voice: 'tunnel', priority: 55 });
    });
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'warning' && c.voice === 'left' && c.accepted));
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.diagnostics.priority), 100);
    assert.equal(await page.locator('#droid-line').textContent(), 'Left flipper!');
    assert.equal(await page.locator('#droid-comms').getAttribute('aria-live'), 'assertive');
    assert.equal(await page.locator('#droid-comms').getAttribute('aria-atomic'), 'true');
    assert.ok(await page.locator('#left').evaluate(el => el.classList.contains('warning')));
    const warningStarted = await page.evaluate(() => window.orbitDebug.audio.history.find(c => c.kind === 'warning').at);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.play({ kind: 'chatter', strength: 1, priority: 20 })), false);
    // Resetting a peak window while rolling proves ongoing sound, not just a
    // remembered confirmation spike. Notes and continuous nodes stay bounded.
    await place({ x: -4, y: 0.305, z: -9 }, { x: 0, y: 0, z: 3 });
    const stepsBefore = await page.evaluate(() => window.orbitDebug.audio.diagnostics.musicSteps);
    await page.waitForFunction(before => window.orbitDebug.audio.diagnostics.musicSteps >= before + 3, stepsBefore);
    await page.evaluate(() => { window.audioProbe.peak = 0; }); await page.waitForTimeout(200);
    const bedPeak = await page.evaluate(() => window.audioProbe.peak); assert.ok(bedPeak > 0.001);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.diagnostics.speaking), false, 'Measure the bed without voice contamination');
    await page.evaluate(() => { for (let i = 0; i < 100; i++) window.orbitDebug.audio.play({ kind: 'wall', strength: 1 }); });
    const bounded = await page.evaluate(() => window.orbitDebug.audio.diagnostics);
    assert.ok(bounded.effects <= 12 && bounded.music <= 10); assert.equal(bounded.loops, 2);
    console.log(`${name}: voice priority, sustained mix and bounded effects`);
    await page.evaluate(async () => { await window.audioProbe.contexts[0].suspend(); });
    await activate(page.locator('#pause')); await activate(page.locator('#resume'));
    await page.waitForFunction(() => window.audioProbe.contexts[0].state === 'running');
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 1);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.paused), true);
    assert.deepEqual(await page.evaluate(() => {
      const d = window.orbitDebug.audio.diagnostics; return [d.effects, d.music, d.loops, d.speaking];
    }), [0, 0, 0, false]);
    await page.waitForTimeout(150); await page.evaluate(() => { window.audioProbe.peak = 0; }); await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.audioProbe.peak), 0, 'Blur must stop every sound layer');
    await activate(page.locator('#resume'));
    // Preserve an actual warning frame while freezing physics for screenshots.
    await place({ x: -1.7, y: 0.305, z: 2 }, { x: 0, y: 0, z: 4 });
    await page.waitForFunction(() => document.querySelector('#droid-line').textContent === 'Left flipper!' && !document.querySelector('#droid-comms').classList.contains('sr-only'));
    await page.evaluate(() => { window.orbitDebug.sim.paused = true; window.orbitDebug.view.render = window.restoreAudioRender; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${out}/${name}-sound-on.png`, timeout: 90000 }); screenshots.push(`${name}-sound-on.png`);
    console.log(`Captured ${name} sound-on`);
    await page.evaluate(() => { window.orbitDebug.sim.paused = false; window.orbitDebug.view.render = () => {}; });
    for (let ball = 0; ball < 3; ball++) {
      await page.evaluate(() => {
        const s = window.orbitDebug.sim; if (s.phase === 'ready') s.launch(0.5);
        s.ball.setTranslation({ x: 0, y: 0.4, z: 11.6 }, true);
      });
      await page.waitForFunction(expected => window.orbitDebug.sim.balls === expected, 2 - ball);
      if (ball < 2) await page.waitForFunction(() => window.orbitDebug.sim.phase === 'ready');
    }
    await page.waitForFunction(() => !window.orbitDebug.audio.diagnostics.speaking);
    assert.deepEqual(await page.evaluate(() => { const d = window.orbitDebug.audio.diagnostics; return [d.music, d.loops]; }), [0, 0]);
    await activate(page.locator('#restart'));
    assert.equal(await page.evaluate(() => window.orbitDebug.sim.balls), 3);
    await page.waitForFunction(() => window.orbitDebug.audio.diagnostics.loops === 2);
    console.log(`${name}: pause/blur and three-ball audio lifecycle`);
    await boot(); assert.equal(await page.locator('#sound').textContent(), 'SOUND ON');
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 0, 'Remembering preference must not autoplay');
    await page.evaluate(() => {
      window.restoreQAContext = window.AudioContext;
      window.AudioContext = function () { throw new Error('Injected unavailable audio device'); };
    });
    await activate(page.locator('#start'));
    await page.waitForFunction(() => document.querySelector('#sound').textContent === 'SOUND OFF' && document.querySelector('#toast').textContent.startsWith('Sound could not start'));
    assert.equal(await page.evaluate(() => localStorage.getItem('orbit-pinball-sound')), 'off');
    assert.equal(await page.evaluate(() => window.audioProbe.sessionTypes.at(-1)), 'auto');
    await page.evaluate(() => { window.AudioContext = window.restoreQAContext; });
    await page.evaluate(() => { window.audioProbe.failDecode = true; });
    await activate(page.locator('#sound'));
    await page.waitForFunction(() => window.audioProbe.contexts[0]?.state === 'running');
    await page.waitForFunction(() => window.orbitDebug.audio.diagnostics.voiceFailed);
    assert.equal(await page.locator('#sound').textContent(), 'SOUND ON');
    await page.evaluate(() => {
      window.audioProbe.peak = 0;
      window.orbitDebug.audio.play({ kind: 'warning', voice: 'left', priority: 100 });
    });
    await page.waitForFunction(() => window.audioProbe.peak > 0.001);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.diagnostics.lastVoice), undefined);
    const fallbackMotifs = await page.evaluate(() => {
      const audio = window.orbitDebug.audio;
      return ['left', 'right', 'both', 'danger'].map(voice => {
        audio.reset(); const start = window.audioProbe.voices.length;
        const accepted = audio.play({ kind: 'warning', voice, priority: 100 });
        return { voice, accepted, frequencies: window.audioProbe.voices.slice(start).filter(Number.isFinite).slice(1), pan: window.audioProbe.panners.at(-1).pan.value };
      });
    });
    assert.ok(fallbackMotifs.every(m => m.accepted && m.frequencies.length >= 2));
    assert.equal(new Set(fallbackMotifs.map(m => JSON.stringify(m.frequencies))).size, 4);
    assert.ok(fallbackMotifs[0].pan < -0.6 && fallbackMotifs[1].pan > 0.6);
    await activate(page.locator('#sound')); assert.equal(await page.locator('#sound').textContent(), 'SOUND OFF');
    await page.waitForTimeout(300); await page.evaluate(() => { window.audioProbe.peak = 0; });
    if (options.hasTouch) { await activate(page.locator('#left')); } else { await page.keyboard.press('KeyA'); }
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.audioProbe.peak), 0, 'Muted audio still reaches output');
    assert.equal(await page.evaluate(() => window.audioProbe.sessionTypes.at(-1)), 'auto');
    await boot(); assert.equal(await page.locator('#sound').textContent(), 'SOUND OFF');
    cases.push({ name, result: 'pass', confirmationPeak, voiceReady, wallPeak, bedPeak, warningStarted, warningPans, fallbackMotifs, bounded,
      headLoss: { spinUp, spinDuration, cue: 'nonverbal ouch cry', caption: 'Oh no, BB-8 lost its head!', automaticFpvReturn: true, pauseCancels: true, reducedMotionCancelsAndSuppressesDraw: true, warningsTakePrecedence: true, cameraControlsAndShortcutsRemoved: true },
      checks: ['first visit muted with no AudioContext', 'explicit click/tap requests playback and emits nonzero audio', 'flipper and launch event tones with keyboard/simultaneous touch', 'original nonverbal beep sprite decodes in the real audio context', 'sampled left/right warnings pan to their sides; both/drain stay centered', 'real Rapier wall/bumper/target sound events', ...(search ? ['live ramp/bridge/tunnel/circuit cues and early right-return warning'] : []), 'forecasted left alert interrupts flavour whistles and blocks lower-priority chatter', 'persistent caption region is polite for ordinary reactions and assertive/atomic for urgent advice', 'nonzero rolling/music output with no active voice; bounded 100-impact burst', 'gesture resumes suspended context without recreating it', 'blur stops all layers and outputs zero; resume rebuilds the mix', 'three drains stop music/loops and restart resets lives/audio', 'sound-on preference restored without autoplay', 'injected saved-on startup failure clears UI/preference/session and allows retry', 'injected sprite-decoding failure retains audible procedural warning fallback', 'all four fallback warning motifs differ; left/right pan correctly', 'mute stops output and releases session', 'sound-off preference survives reload'] });
    console.log(`${name}: audio checks pass`);
    // Keep one page alive with single-process Chromium while opening the next.
  }
  assert.deepEqual(errors, []);
  const report = { result: 'pass', cases, screenshots, browserErrors: errors,
    limitations: ['Chromium waveform measurements verify generated audio, not speaker audibility.', 'Safari audioSession is stubbed in this test; physical iPhone Silent Mode, Bluetooth routing and media volume remain unverified.', 'Live-region priorities were checked in the DOM; screen-reader announcement timing was not measured.'] };
  writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(async e => {
  console.error(e); process.exitCode = 1;
  if (activePage && !activePage.isClosed()) console.error('Audio failure state:', await activePage.evaluate(() => ({
    voices: window.audioProbe?.voices, peak: window.audioProbe?.peak, audioStates: window.audioProbe?.contexts.map(c => c.state),
    phase: window.orbitDebug?.sim.phase, paused: window.orbitDebug?.sim.paused, controls: window.orbitDebug?.sim.controls,
  })).catch(() => 'unavailable'));
}).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
