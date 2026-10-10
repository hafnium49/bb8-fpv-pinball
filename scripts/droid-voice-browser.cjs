const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
let server, browser;

(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  const cases = [];
  for (const name of (process.env.VOICE_BROWSERS || 'chromium,webkit').split(',')) {
    const errors = [], voices = [];
    const engine = name === 'webkit' ? webkit : chromium;
    browser = await engine.launch(name === 'webkit' ? { headless: true } : {
      headless: true, executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(45000);
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const Native = window.AudioContext;
      window.droidProbe = { peak: 0, clips: [], contexts: [] };
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args); window.droidProbe.contexts.push(this);
          const analyser = this.createAnalyser(), values = new Float32Array(1024);
          const gain = this.createGain.bind(this), source = this.createBufferSource.bind(this);
          analyser.fftSize = values.length;
          this.createGain = () => {
            const node = gain(), connect = node.connect.bind(node);
            node.connect = (target, ...rest) => { if (target === this.destination) connect(analyser); return connect(target, ...rest); };
            return node;
          };
          this.createBufferSource = () => {
            const node = source(), start = node.start.bind(node);
            node.start = (when, offset, duration) => {
              if (duration !== undefined) window.droidProbe.clips.push({ offset, duration });
              return start(when, offset, duration);
            };
            return node;
          };
          setInterval(() => { analyser.getFloatTimeDomainData(values); for (const v of values) window.droidProbe.peak = Math.max(window.droidProbe.peak, Math.abs(v)); }, 5);
        }
      };
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.locator('#start:not([disabled])').waitFor();
    await page.evaluate(() => { window.orbitDebug.view.render = () => {}; window.orbitDebug.headLoss.draw = () => 1; });
    await page.locator('#sound').click();
    await page.waitForFunction(() => window.orbitDebug.audio.diagnostics.voiceReady && window.droidProbe.peak > .001);
    await page.locator('#start').click();
    await page.evaluate(() => {
      const { sim, audio, soundDirector } = window.orbitDebug;
      sim.launch(.5); sim.events.length = 0; sim.update = () => {};
      sim.ball.setTranslation({ x: -4, y: .295, z: -9 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      soundDirector.reset(); audio.reset(); audio.setMusicVolume(0);
    });
    const bank = await page.evaluate(async () => (await import('/src/ui/voice-bank.ts')).voiceBank);
    for (const [key, family] of Object.entries(bank)) {
      const starts = [];
      for (let i = 0; i < family.variants.length; i++) {
        const before = await page.evaluate(() => window.droidProbe.clips.length);
        assert.equal(await page.evaluate(key => {
          window.droidProbe.peak = 0;
          return window.orbitDebug.audio.play({ kind: ['left','right','both','danger'].includes(key) ? 'warning' : 'chatter', voice: key, priority: 100 });
        }, key), true);
        await page.waitForFunction(() => window.droidProbe.peak > .001);
        await page.waitForFunction(() => !window.orbitDebug.audio.diagnostics.speaking);
        const played = await page.evaluate(() => ({ clip: window.droidProbe.clips.at(-1), count: window.droidProbe.clips.length,
          peak: window.droidProbe.peak, ...window.orbitDebug.audio.diagnostics }));
        assert.equal(played.count, before + 1); assert.equal(played.lastVoice, key); assert.equal(played.voiceSource, 'sprite');
        assert.ok(played.peak > .001 && played.peak < .95);
        assert.ok(family.variants.some(c => c.offset === played.clip.offset && c.duration === played.clip.duration));
        starts.push(played.clip.offset);
        voices.push({ key, variant: played.voiceVariant, peak: played.peak, ...played.clip });
      }
      assert.equal(new Set(starts).size, family.variants.length);
      console.log(`${name}: ${key} ${starts.length} variants audible`);
    }
    // A real warning replaces flavour immediately. A rejected flavour cue
    // must not consume a variant, which would make rotation unpredictable.
    const precedence = await page.evaluate(() => {
      const { audio } = window.orbitDebug;
      audio.play({ kind: 'chatter', voice: 'idle', priority: 15 });
      const warning = audio.play({ kind: 'warning', voice: 'left', priority: 100 });
      const variant = audio.diagnostics.voiceVariant;
      const flavour = audio.play({ kind: 'chatter', voice: 'bridge', priority: 55 });
      return { warning, flavour, variant, ...audio.diagnostics };
    });
    assert.ok(precedence.warning && !precedence.flavour); assert.equal(precedence.lastVoice, 'left'); assert.equal(precedence.variant, 0);
    await page.evaluate(() => window.orbitDebug.audio.setPaused(true));
    await page.waitForTimeout(130);
    await page.evaluate(() => { window.droidProbe.peak = 0; }); await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.droidProbe.peak), 0);
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.diagnostics.speaking), false);
    await page.evaluate(() => { const { audio } = window.orbitDebug; audio.setPaused(false); audio.setEnabled(false); });
    assert.equal(await page.evaluate(() => window.orbitDebug.audio.play({ kind: 'chatter', voice: 'idle' })), false);
    assert.equal(await page.evaluate(() => window.droidProbe.contexts.length), 1);
    assert.deepEqual(errors, []);
    cases.push({ browser: name, variants: voices, urgentPriority: precedence.priority, pauseSilent: true, muteRejects: true,
      oneAudioContext: true, errors });
    await browser.close(); browser = undefined;
  }
  const report = { result: 'pass', cases, limitations: ['Waveforms verify browser playback, not subjective timbre or physical speaker quality.'] };
  mkdirSync('artifacts/droid-voice', { recursive: true });
  writeFileSync('artifacts/droid-voice/browser.json', JSON.stringify(report, null, 2) + '\n');
  console.log('All voice variants, urgent priority, pause and mute pass');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
