import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const title = 'Be the Ball 8: FPV Pinball';
test('approved game title is consistent in metadata, visible wordmark, and accessible names', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`name="description" content="${title}.`));
  const wordmark = main.match(/<a class="wordmark"[\s\S]*?<strong>([\s\S]*?)<\/strong>/)![1];
  assert.equal(wordmark.replace(/<[^>]+>/g, ''), title);
  assert.ok(main.includes(`aria-label="${title} game"`));
  assert.ok(main.includes(`aria-label="${title} home"`));
  assert.ok(main.includes(`<h1 aria-label="${title}">`));
  assert.ok(readme.startsWith(`# ${title}\n`));
  // Preserve existing saved scores and preferences across this display rename.
  for (const key of ['best', 'runs', 'sound', 'music-volume'])
    assert.ok(main.includes(`orbit-pinball-${key}`));
});

test('install metadata changes its label without creating a new app identity', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const fullscreen = readFileSync(new URL('../src/ui/fullscreen.ts', import.meta.url), 'utf8');
  assert.equal(manifest.name, title);
  assert.equal(manifest.short_name, 'Be the Ball 8');
  assert.ok(html.includes('name="apple-mobile-web-app-title" content="Be the Ball 8"'));
  assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ['./', './', './']);
  assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'));
  assert.ok(main.includes('Launch <b>Be the Ball 8</b> from its Home Screen icon.'));
  assert.ok(!fullscreen.includes('open ORBIT'));
  assert.equal((fullscreen.match(/open Be the Ball 8/g) || []).length, 2);
  // Keep the existing origin-relative icon paths and storage namespace.
  assert.deepEqual(manifest.icons.map((icon: { src: string }) => icon.src), ['icons/orbit-192.png', 'icons/orbit-512.png']);
  const keys = [...main.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['orbit-pinball-best', 'orbit-pinball-music-volume', 'orbit-pinball-runs', 'orbit-pinball-sound']);
});
