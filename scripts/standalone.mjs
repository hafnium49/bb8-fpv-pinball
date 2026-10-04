import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync('dist/index.html', 'utf8');
const scriptPath = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
const stylePath = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/)?.[1];
if (!scriptPath || !stylePath) throw new Error('Expected one Vite script and stylesheet');
const script = fs.readFileSync(path.join('dist', scriptPath), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = fs.readFileSync(path.join('dist', stylePath), 'utf8');
const result = html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${script}</script>`)
  .replace(/<link[^>]*href="[^"]+\.css"[^>]*>/, () => `<style>${style}</style>`)
  .replace('<html', () => `<!-- Third-party licenses\n${fs.readFileSync('THIRD-PARTY-NOTICES.txt', 'utf8')}\n-->\n<html`);
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/ORBIT-FPV-Pinball.html', result);
console.log('Wrote artifacts/ORBIT-FPV-Pinball.html');
