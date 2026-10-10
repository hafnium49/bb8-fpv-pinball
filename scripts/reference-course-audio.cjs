const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
let server, browser;
(async () => {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: '127.0.0.1', port: 5199, strictPort: true, watch: { ignored: () => true }, hmr: false } });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...JSON.parse(process.env.CHROME_ARGS || '[]')] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const errors = [], ramps = [], warnings = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.courseAudioProbe = { peak: 0, contexts: [] };
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.courseAudioProbe.contexts.push(this);
        const analyser = this.createAnalyser(), samples = new Float32Array(1024), gain = this.createGain.bind(this);
        analyser.fftSize = 1024;
        this.createGain = () => {
          const node = gain(), connect = node.connect.bind(node);
          node.connect = (target, ...rest) => { if (target === this.destination) connect(analyser); return connect(target, ...rest); };
          return node;
        };
        setInterval(() => { analyser.getFloatTimeDomainData(samples); for (const value of samples) window.courseAudioProbe.peak = Math.max(window.courseAudioProbe.peak, Math.abs(value)); }, 5);
      }
    };
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.locator('#start:not([disabled])').waitFor();
  await page.evaluate(() => { const { view, headLoss } = window.orbitDebug; view.render = () => {}; headLoss.draw = () => 1; });
  await page.locator('#sound').click();
  await page.waitForFunction(() => window.courseAudioProbe.peak > .001 && window.orbitDebug.audio.diagnostics.voiceReady);
  const confirmationPeak = await page.evaluate(() => window.courseAudioProbe.peak);
  await page.locator('#start').click();
  for (let i = 0; i < 3; i++) {
    const name = await page.evaluate(async i => {
      const { courseRamps, pathFrame } = await import('/src/physics/reference-course.ts');
      const { sim, audio, soundDirector, begin } = window.orbitDebug;
      begin(); sim.launch(.5); sim.events.length = 0; audio.reset(); audio.history.length = 0; soundDirector.reset();
      const r = courseRamps[i], p = r.points[0], t = pathFrame(r, 0).tangent;
      sim.ball.setTranslation({ x: p.x - t.x * .6, y: .295, z: p.z - t.z * .6 }, true);
      sim.ball.setLinvel({ x: t.x * 25, y: 0, z: t.z * 25 }, true);
      sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); window.courseAudioProbe.peak = 0;
      return r.name;
    }, i);
    await page.waitForFunction(() => window.orbitDebug.sim.route.completions >= 1 && window.orbitDebug.audio.history.some(c => c.kind === 'circuit' && c.accepted));
    const result = await page.evaluate(() => { const { sim, audio } = window.orbitDebug; sim.paused = true; return { history: [...audio.history], peak: window.courseAudioProbe.peak, completions: sim.route.completions, onDeck: sim.reference.onDeck }; });
    for (const kind of ['ascent', 'bridge', 'circuit']) assert.ok(result.history.some(c => c.kind === kind), `${name}: missing ${kind}`);
    assert.ok(result.peak > .001); assert.equal(result.completions, 1); assert.equal(result.onDeck, i === 2);
    ramps.push({ name, ...result }); console.log(`${name}: real route and nonverbal audio pass`);
  }
  for (const deck of [false, true]) {
    await page.evaluate(async deck => {
      const { courseFlippers } = await import('/src/physics/reference-course.ts');
      const { sim, audio, soundDirector, begin } = window.orbitDebug; begin(); sim.launch(.5); sim.events.length = 0; audio.reset(); audio.history.length = 0; soundDirector.reset();
      const f = courseFlippers[deck ? 2 : 0];
      sim.ball.setTranslation({ x: f.x + .7, y: f.y + .295, z: f.z - 2 }, true);
      sim.ball.setLinvel({ x: 0, y: 0, z: 4 }, true); sim.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }, deck);
    await page.waitForFunction(() => window.orbitDebug.audio.history.some(c => c.kind === 'warning' && c.voice === 'left' && c.accepted));
    warnings.push(await page.evaluate(deck => { const { sim, audio } = window.orbitDebug; sim.paused = true; return { deck, onDeck: sim.reference.onDeck, priority: audio.diagnostics.priority, caption: document.getElementById('droid-line').textContent }; }, deck));
    assert.equal(warnings.at(-1).onDeck, deck); assert.equal(warnings.at(-1).priority, 100);
  }
  await page.evaluate(() => {
    const { sim, audio, soundDirector, begin } = window.orbitDebug; begin(); sim.launch(.5); sim.update = () => {}; sim.events.length = 0;
    sim.ball.setTranslation({ x: -3, y: .295, z: 5 }, true); sim.ball.setLinvel({ x: 0, y: 0, z: 3 }, true);
    audio.reset(); soundDirector.reset(); window.courseAudioProbe.peak = 0;
  });
  await page.waitForFunction(() => window.orbitDebug.audio.diagnostics.musicSteps >= 3 && !window.orbitDebug.audio.diagnostics.speaking);
  await page.evaluate(() => { window.courseAudioProbe.peak = 0; }); await page.waitForTimeout(250);
  const bed = await page.evaluate(() => ({ peak: window.courseAudioProbe.peak, ...window.orbitDebug.audio.diagnostics }));
  assert.ok(bed.peak > .001 && bed.peak < .95); assert.equal(bed.loops, 2); assert.ok(bed.effects <= 12 && bed.music <= 10);
  assert.deepEqual(errors, []);
  mkdirSync('artifacts/reference-course', { recursive: true });
  writeFileSync('artifacts/reference-course/audio-report.json', JSON.stringify({ result: 'pass', confirmationPeak, ramps, warnings, bed, errors }, null, 2) + '\n');
  console.log('Both playfield warnings and sustained music/rolling mix pass');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await server.close(); });
