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
