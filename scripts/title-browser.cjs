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
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const results = [];
    for (const [width, height] of [[1440,900],[1280,720],[768,1024],[844,390],[667,375],[375,812],[430,932]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      await page.locator('#start:not([disabled])').waitFor({ timeout: 60000 });
      assert.equal(await page.title(), 'Be the Ball 8: FPV Pinball');
      for (const phase of ['intro','ready']) {
        if (phase === 'ready') await page.locator('#start').click();
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.screenshot({ path: path.join(output, `${width}x${height}-${phase}.png`) });
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
      }
      await context.close();
    }
    fs.writeFileSync(path.join(output,'layout-results.json'), JSON.stringify(results,null,2));
    console.log('Title layout checks passed across seven desktop/tablet/mobile viewports.');
  } finally { if(browser) await browser.close(); await server.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
