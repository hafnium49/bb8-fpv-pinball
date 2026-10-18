const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const output = path.resolve('artifacts/title'); fs.mkdirSync(output, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5173, hmr: false, watch: { ignored: () => true } } });
  let browser;
  try {
    await server.listen();
    const launchOptions = { executablePath: process.env.CHROME_PATH || undefined, headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
    const results = [];
    for (const [width, height] of [[1440,900],[1280,720],[768,1024],[844,390],[667,375],[375,812],[430,932]]) {
      console.log(`Checking ${width}x${height}`);
      browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce',
        isMobile: width < 1000, hasTouch: width < 1000 });
      const page = await context.newPage(); const errors = [];
      await page.addInitScript(() => {
        // Keep title geometry tied to the requested viewport; fullscreen has its own suite.
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
        Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, value: false });
        localStorage.setItem('orbit-pinball-best', '12345');
        localStorage.setItem('orbit-pinball-music-volume', '27');
      });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      await page.locator('#start:not([disabled])').waitFor({ timeout: 60000 });
      // Freeze continuous GPU work, as in cabinet-browser.cjs; render each state once.
      await page.evaluate(() => { const {view}=window.orbitDebug; window.titleRender=view.render.bind(view); view.render=()=>{}; });
      assert.equal(await page.title(), 'Be the Ball 8: FPV Pinball');
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'), 'Be the Ball 8');
      assert.equal(await page.locator('#best-score').textContent(), '12345');
      assert.equal(await page.locator('#music-volume').inputValue(), '27');
      const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
      assert.equal(manifest.name, 'Be the Ball 8: FPV Pinball');
      assert.equal(manifest.short_name, 'Be the Ball 8');
      assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ['./', './', './']);
      for (const phase of ['intro','ready']) {
        if (phase === 'ready') await page.locator('#start').click();
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.evaluate(() => window.titleRender(window.orbitDebug.sim, 1/60));
        await page.screenshot({ path: path.join(output, `${width}x${height}-${phase}.png`), timeout: 60000 });
        const layout = await page.evaluate(() => {
          const box = e => { const r=e.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
          const w=document.querySelector('.wordmark'), t=w.querySelector('strong'), a=document.querySelector('.top-actions');
          const range=document.createRange(); range.selectNodeContents(t);
          return { title: t.textContent, wordmark:box(w), text:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom})), actions:box(a), viewport:{width:innerWidth,height:innerHeight}, controls:[...a.querySelectorAll('button')].map(box) };
        });
        const intersects = (a,b) => a.x < b.right-1 && a.right > b.x+1 && a.y < b.bottom-1 && a.bottom > b.y+1;
        for (const r of layout.text) {
          assert.ok(r.x >= -1 && r.right <= width+1 && r.y >= -1 && r.bottom <= height+1, `${width}x${height} ${phase}: title outside viewport`);
          for (const c of layout.controls) assert.ok(!intersects(r,c), `${width}x${height} ${phase}: title overlaps controls`);
        }
        assert.equal(layout.title, 'Be the Ball 8: FPV Pinball');
        assert.deepEqual(errors, [], 'browser runtime errors');
        results.push({width,height,phase,...layout});
        fs.writeFileSync(path.join(output,'layout-results.json'), JSON.stringify(results,null,2));
      }
      await context.close();
      await browser.close(); browser=undefined;
    }
    fs.writeFileSync(path.join(output,'layout-results.json'), JSON.stringify(results,null,2));
    console.log('Title layout checks passed across seven desktop/tablet/mobile viewports.');
  } finally { if(browser) await browser.close(); await server.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
