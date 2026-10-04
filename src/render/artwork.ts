import * as THREE from 'three';
import { bumpers, targets } from '../physics/table';

function canvas(width: number, height: number) {
  const image = document.createElement('canvas'); image.width = width; image.height = height;
  return { image, c: image.getContext('2d')! };
}
function texture(image: HTMLCanvasElement) {
  const result = new THREE.CanvasTexture(image); result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8; return result;
}
function random(seed = 43) { return () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; }; }

export function playfieldTexture() {
  const { image, c } = canvas(1024, 2048), rand = random();
  const x = (v: number) => (v + 6) / 12 * 1024, z = (v: number) => (v + 11) / 22 * 2048;
  const background = c.createLinearGradient(0, 0, 1024, 2048);
  background.addColorStop(0, '#0e2546'); background.addColorStop(0.38, '#191b43');
  background.addColorStop(0.7, '#101d34'); background.addColorStop(1, '#07222e');
  c.fillStyle = background; c.fillRect(0, 0, 1024, 2048);
  const haze = c.createRadialGradient(330, 900, 0, 330, 900, 740);
  haze.addColorStop(0, '#744ca966'); haze.addColorStop(0.45, '#293e7244'); haze.addColorStop(1, '#08152c00');
  c.fillStyle = haze; c.fillRect(0, 0, 1024, 2048);
  for (let i = 0; i < 750; i++) {
    c.fillStyle = `rgba(185,219,255,${0.06 + rand() * 0.4})`;
    const size = rand() > 0.97 ? 3 : 1; c.fillRect(rand() * 1024, rand() * 2048, size, size);
  }
  c.strokeStyle = '#7aabc916'; c.lineWidth = 1;
  for (let q = 32; q < 1024; q += 48) { c.beginPath(); c.moveTo(q, 0); c.lineTo(q, 2048); c.stroke(); }
  for (let q = 32; q < 2048; q += 48) { c.beginPath(); c.moveTo(0, q); c.lineTo(1024, q); c.stroke(); }
  function path(points: number[][], color: string, width = 3, glow = 0) {
    c.strokeStyle = color; c.lineWidth = width; c.shadowColor = color; c.shadowBlur = glow;
    c.beginPath(); points.forEach(([a, b], i) => i ? c.lineTo(x(a), z(b)) : c.moveTo(x(a), z(b))); c.stroke(); c.shadowBlur = 0;
  }
  // Painted circuits, orbit tracks and inserts sit under the physical mechanisms.
  for (let side = -1; side <= 1; side += 2) {
    path([[side * 4.3, -10], [side * 4.3, -8.8], [side * 3.3, -7.8], [side * 3.3, -5.5]], '#4cd7ef', 3, 9);
    path([[side * 4.5, 1.7], [side * 4.5, 3.1], [side * 2.5, 5.2], [side * 2.5, 6.0]], side < 0 ? '#47ddef' : '#ffb05c', 4, 10);
    path([[side * 4.3, 1.7], [side * 4.3, 2.9], [side * 2.25, 5.1]], '#395a8c', 2);
    for (let q = 0; q < 12; q++) {
      c.fillStyle = q % 3 === 0 ? '#61e2eb' : '#27465f';
      c.fillRect(x(side * 5.4) - 6, z(-8.8 + q * 0.55), 12, 23);
    }
  }
  // A large illustrated planet gives the field its own arcade artwork.
  const px = x(-0.45), py = z(0.45), radius = 228;
  c.save(); c.translate(px, py); c.rotate(-0.36);
  c.strokeStyle = '#62c9ed'; c.lineWidth = 5; c.shadowColor = '#42bbff'; c.shadowBlur = 17;
  c.beginPath(); c.ellipse(0, 0, 330, 126, 0, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
  c.save(); c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.clip();
  const planet = c.createLinearGradient(-radius, -radius, radius, radius);
  planet.addColorStop(0, '#ffbf89'); planet.addColorStop(0.25, '#b36db3'); planet.addColorStop(0.58, '#574d91'); planet.addColorStop(1, '#142e55');
  c.fillStyle = planet; c.fillRect(-radius, -radius, radius * 2, radius * 2);
  for (let q = -radius; q < radius; q += 17) {
    c.strokeStyle = q % 2 ? '#b7a2ea30' : '#f6c3a545'; c.lineWidth = 5 + rand() * 9;
    c.beginPath(); c.moveTo(-radius, q); c.bezierCurveTo(-110, q - 30, 120, q + 50, radius, q + 15); c.stroke();
  }
  const shade = c.createRadialGradient(-110, -140, 10, 10, 10, 360);
  shade.addColorStop(0, '#ffffff30'); shade.addColorStop(0.6, '#14234300'); shade.addColorStop(1, '#020921e8');
  c.fillStyle = shade; c.fillRect(-radius, -radius, radius * 2, radius * 2); c.restore();
  c.strokeStyle = '#ffc388'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, radius, -2.9, -0.6); c.stroke();
  c.strokeStyle = '#77dcf7'; c.lineWidth = 8; c.shadowColor = '#50bfff'; c.shadowBlur = 14;
  c.beginPath(); c.ellipse(0, 0, 330, 126, 0, 0.08, Math.PI - 0.08); c.stroke(); c.restore(); c.shadowBlur = 0;
  for (const [i, b] of bumpers.entries()) {
    const color = i === 1 ? '#57e8fa' : '#ffb75c';
    c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 10; c.lineWidth = 3;
    for (const r of [87, 106, 131]) { c.beginPath(); c.arc(x(b.x), z(b.z), r, 0.1, Math.PI * 1.78); c.stroke(); }
    c.shadowBlur = 0;
    for (let n = 0; n < 16; n++) {
      const a = n * Math.PI / 8; c.save(); c.translate(x(b.x), z(b.z)); c.rotate(a);
      c.fillStyle = n % 4 === 0 ? color : '#467195'; c.fillRect(118, -2, 10, 4); c.restore();
    }
    c.fillStyle = color; c.font = 'bold 19px monospace'; c.textAlign = 'center'; c.fillText(`REACTOR 0${i + 1}`, x(b.x), z(b.z) + 159);
  }
  for (const [i, t] of targets.entries()) {
    c.strokeStyle = i ? '#ffb75c' : '#57e8fa'; c.lineWidth = 3;
    c.strokeRect(x(t.x) - 36, z(t.z) - 97, 72, 194);
    c.save(); c.translate(x(t.x), z(t.z)); c.rotate(-Math.PI / 2);
    c.fillStyle = '#eef3ff'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText('BOOST +250', 0, i ? -50 : 54); c.restore();
  }
  c.textAlign = 'center'; c.fillStyle = '#f6f3e8'; c.shadowColor = '#54d9ff'; c.shadowBlur = 18;
  c.font = 'italic 900 112px sans-serif'; c.fillText('ORBIT', x(-0.4), z(4.6)); c.shadowBlur = 0;
  c.font = 'bold 23px monospace'; c.fillStyle = '#71e5f4'; c.fillText('O R B I T A L   A R C A D E', x(-0.4), z(5.05));
  c.font = '17px monospace'; c.fillStyle = '#809abf'; c.fillText('SECTOR 07   /   INERTIAL PILOT SYSTEM', x(-0.4), z(5.5));
  // Launch-lane arrows and bright flipper approach cues.
  for (let n = 0; n < 9; n++) {
    path([[4.98, 8.9 - n * 0.8], [5.18, 8.65 - n * 0.8], [5.38, 8.9 - n * 0.8]], '#6ce8f7', 5, 7);
  }
  for (let side = -1; side <= 1; side += 2) for (let n = 0; n < 3; n++) {
    const a = side * (1.05 + n * 0.4);
    path([[a - side * 0.12, 6.5], [a, 6.75], [a + side * 0.12, 6.5]], side < 0 ? '#68ebfa' : '#ffbc76', 5, 9);
  }
  c.fillStyle = '#ffb966'; c.font = 'bold 26px monospace'; c.fillText('LAUNCH / RETURN / REPEAT', x(0), z(10.2));
  return texture(image);
}

export function backboardTexture() {
  const { image, c } = canvas(1024, 256);
  c.fillStyle = '#050e20'; c.fillRect(0, 0, 1024, 256);
  const glow = c.createLinearGradient(0, 0, 1024, 0); glow.addColorStop(0, '#12667b'); glow.addColorStop(0.5, '#1a1946'); glow.addColorStop(1, '#82431d');
  c.fillStyle = glow; c.fillRect(8, 8, 1008, 240); c.fillStyle = '#071128'; c.fillRect(13, 13, 998, 230);
  c.strokeStyle = '#60eaf8'; c.lineWidth = 2; c.strokeRect(28, 28, 968, 200);
  c.textAlign = 'center'; c.font = 'italic 900 114px sans-serif'; c.fillStyle = '#effbff'; c.shadowColor = '#5ce5ff'; c.shadowBlur = 16;
  c.fillText('ORBIT', 512, 151); c.shadowBlur = 0;
  c.font = 'bold 20px monospace'; c.fillStyle = '#ffb65a'; c.fillText('SECTOR 07     •     ORBITAL ARCADE', 512, 199);
  c.font = 'bold 24px monospace'; c.fillStyle = '#63e8f5'; c.fillText('01', 102, 140); c.fillStyle = '#ffb65a'; c.fillText('FPV', 915, 140);
  for (let y = 0; y < 256; y += 4) { c.fillStyle = '#00000022'; c.fillRect(0, y, 1024, 1); }
  return texture(image);
}

export function railTexture() {
  const { image, c } = canvas(1024, 128);
  c.fillStyle = '#0b1930'; c.fillRect(0, 0, 1024, 128);
  for (let n = 0; n < 8; n++) {
    const x = n * 128;
    c.fillStyle = n % 2 ? '#152b46' : '#12233e'; c.fillRect(x + 3, 20, 122, 91);
    c.strokeStyle = '#395875'; c.lineWidth = 1; c.strokeRect(x + 9, 27, 110, 76);
    for (let v = 0; v < 5; v++) { c.fillStyle = '#07101f'; c.fillRect(x + 23 + v * 17, 49, 8, 39); }
    c.fillStyle = '#4ab8d6'; c.fillRect(x + 23, 34, 14, 3);
    c.fillStyle = '#6a88a7'; c.font = '9px monospace'; c.fillText(`ORBIT / 0${n + 1}`, x + 51, 40);
  }
  c.fillStyle = '#22415d'; c.fillRect(0, 114, 1024, 2); c.fillStyle = '#376078'; c.fillRect(0, 11, 1024, 2);
  return texture(image);
}

export function nebulaTexture() {
  const { image, c } = canvas(1024, 512), rand = random(121);
  c.fillStyle = '#030612'; c.fillRect(0, 0, 1024, 512);
  for (let n = 0; n < 18; n++) {
    const px = 360 + n * 32, py = 250 + Math.sin(n * 0.6) * 65;
    const g = c.createRadialGradient(px, py, 0, px, py, 110 + rand() * 80);
    g.addColorStop(0, n % 3 ? '#24275b55' : '#5c2c6555'); g.addColorStop(1, '#00000000');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
  }
  for (let n = 0; n < 650; n++) { c.fillStyle = `rgba(160,191,245,${0.15 + rand() * 0.5})`; c.fillRect(rand() * 1024, rand() * 512, 1, 1); }
  return texture(image);
}

export function glowTexture() {
  const { image, c } = canvas(64, 64);
  const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.12, '#ffffffee'); glow.addColorStop(0.4, '#ffffff55'); glow.addColorStop(1, '#ffffff00');
  c.fillStyle = glow; c.fillRect(0, 0, 64, 64); return texture(image);
}

export function scoreTexture(points: number) {
  const { image, c } = canvas(256, 96);
  c.textAlign = 'center'; c.font = 'italic bold 62px sans-serif'; c.fillStyle = '#ffffff'; c.shadowColor = '#6ff2ff'; c.shadowBlur = 10;
  c.fillText(`+${points}`, 128, 70); return texture(image);
}
