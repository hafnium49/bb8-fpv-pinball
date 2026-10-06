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
      window.audioProbe = { contexts: [], voices: [], peak: 0, sessionTypes: [] };
      Object.defineProperty(navigator, 'audioSession', { configurable: true,
        value: { set type(value) { window.audioProbe.sessionTypes.push(value); } } });
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args); window.audioProbe.contexts.push(this);
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
      await page.evaluate(() => { const view = window.orbitDebug.view; window.restoreAudioRender = view.render.bind(view); view.render = () => {}; });
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
    await page.evaluate(async () => { await window.audioProbe.contexts[0].suspend(); });
    await activate(page.locator('#pause')); await activate(page.locator('#resume'));
    await page.waitForFunction(() => window.audioProbe.contexts[0].state === 'running');
    assert.equal(await page.evaluate(() => window.audioProbe.contexts.length), 1);
    await page.evaluate(() => { window.orbitDebug.sim.paused = true; window.orbitDebug.view.render = window.restoreAudioRender; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${out}/${name}-sound-on.png`, timeout: 90000 }); screenshots.push(`${name}-sound-on.png`);
    console.log(`Captured ${name} sound-on`);
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
    await activate(page.locator('#sound'));
    await page.waitForFunction(() => window.audioProbe.contexts[0]?.state === 'running');
    await activate(page.locator('#sound')); assert.equal(await page.locator('#sound').textContent(), 'SOUND OFF');
    await page.waitForTimeout(300); await page.evaluate(() => { window.audioProbe.peak = 0; });
    if (options.hasTouch) { await activate(page.locator('#left')); } else { await page.keyboard.press('KeyA'); }
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.audioProbe.peak), 0, 'Muted audio still reaches output');
    assert.equal(await page.evaluate(() => window.audioProbe.sessionTypes.at(-1)), 'auto');
    await boot(); assert.equal(await page.locator('#sound').textContent(), 'SOUND OFF');
    cases.push({ name, result: 'pass', confirmationPeak, checks: ['first visit muted with no AudioContext', 'explicit click/tap requests playback and emits nonzero audio', 'flipper and launch event tones', 'gesture resumes suspended context without recreating it', 'sound-on preference restored without autoplay', 'injected saved-on startup failure clears UI/preference/session and allows retry', 'mute stops output and releases session', 'sound-off preference survives reload'] });
    console.log(`${name}: audio checks pass`);
    // Keep one page alive with single-process Chromium while opening the next.
  }
  assert.deepEqual(errors, []);
  const report = { result: 'pass', cases, screenshots, browserErrors: errors,
    limitations: ['Chromium waveform measurements verify generated audio, not speaker audibility.', 'Safari audioSession is stubbed in this test; physical iPhone Silent Mode, Bluetooth routing and media volume remain unverified.'] };
  writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(async e => {
  console.error(e); process.exitCode = 1;
  if (activePage && !activePage.isClosed()) console.error('Audio failure state:', await activePage.evaluate(() => ({
    voices: window.audioProbe?.voices, peak: window.audioProbe?.peak, audioStates: window.audioProbe?.contexts.map(c => c.state),
    phase: window.orbitDebug?.sim.phase, paused: window.orbitDebug?.sim.paused, controls: window.orbitDebug?.sim.controls,
  })).catch(() => 'unavailable'));
}).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
