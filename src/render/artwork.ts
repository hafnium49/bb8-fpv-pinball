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

export function playfieldTexture(circuitEnabled = false) {
  const { image, c } = canvas(1024, 2048), rand = random();
  const x = (v: number) => (v + 6) / 12 * 1024, z = (v: number) => (v + 11) / 22 * 2048;
  const background = c.createLinearGradient(0, 0, 900, 2048);
  background.addColorStop(0, '#261947'); background.addColorStop(.35, '#523578');
  background.addColorStop(.7, '#794768'); background.addColorStop(1, '#2a213d');
  c.fillStyle = background; c.fillRect(0, 0, 1024, 2048);
  const haze = c.createRadialGradient(500, 680, 0, 500, 680, 800);
  haze.addColorStop(0, '#bca4eb55'); haze.addColorStop(1, '#23204e00'); c.fillStyle = haze; c.fillRect(0, 0, 1024, 2048);
  for (let i = 0; i < 1050; i++) {
    c.fillStyle = `rgba(242,230,255,${.12 + rand() * .6})`;
    const size = rand() > .96 ? 3 : 1; c.fillRect(rand() * 1024, rand() * 2048, size, size);
  }
  function path(points: number[][], color: string, width = 3) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    points.forEach(([a, b], i) => i ? c.lineTo(x(a), z(b)) : c.moveTo(x(a), z(b))); c.stroke();
  }
  // Printed orbits connect the three jet bumpers; no animated texture uploads.
  c.strokeStyle = '#e5cc7766'; c.lineWidth = 2;
  for (const r of [265, 308, 359]) { c.beginPath(); c.ellipse(x(0), z(-4.6), r, r * 1.13, 0, 0, Math.PI * 2); c.stroke(); }
  for (let arm = 0; arm < 4; arm++) {
    c.beginPath();
    for (let i = 0; i <= 180; i++) {
      const a = i / 180 * Math.PI * 3.5 + arm * Math.PI / 2, r = 9 + i * .73;
      const px = x(-1.45) + Math.cos(a) * r, py = z(.15) + Math.sin(a) * r;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.strokeStyle = arm % 2 ? '#ecddff' : '#b79ae5'; c.lineWidth = 4; c.stroke();
  }
  c.font = 'bold 15px monospace'; c.fillStyle = '#efe3fa'; c.textAlign = 'center'; c.fillText('ORBITAL FIELD', x(-1.45), z(1.9));
  for (const [i, b] of bumpers.entries()) {
    const color = i === 1 ? '#74e5f2' : '#ffda64';
    c.strokeStyle = color; c.lineWidth = 3;
    for (const r of [85, 99, 127]) { c.beginPath(); c.arc(x(b.x), z(b.z), r, 0, Math.PI * 2); c.stroke(); }
    for (let n = 0; n < 12; n++) {
      const a = n * Math.PI / 6; c.save(); c.translate(x(b.x), z(b.z)); c.rotate(a);
      c.fillStyle = color; c.fillRect(119, -2, 12, 4); c.restore();
    }
    c.fillStyle = color; c.font = 'bold 17px monospace'; c.fillText('JET BUMPER · 100', x(b.x), z(b.z) + 153);
  }
  for (const [i, t] of targets.entries()) {
    const color = i ? '#ffd271' : '#72e9ef';
    path([[t.x, t.z - 1.15], [t.x - .8, t.z - 1.15], [t.x - .8, t.z + 1.15], [t.x, t.z + 1.15]], color);
    c.save(); c.translate(x(t.x), z(t.z)); c.rotate(-Math.PI / 2); c.fillStyle = color;
    c.font = 'bold 16px monospace'; c.fillText('BOOST 250', 0, i ? -50 : 64); c.restore();
  }
  path([[-2.1, 3.0], [2.1, 3.0], [0, 6.75], [-2.1, 3.0]], '#e9cf78', 4);
  for (const [i, label] of ['100', '250', circuitEnabled ? '750' : '3 BALLS'].entries()) {
    const px = x((i - 1) * 1.1), py = z(2.45);
    c.fillStyle = i === 1 ? '#91d6c2' : '#efbdc8'; c.beginPath(); c.arc(px, py, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#362a49'; c.font = 'bold 15px monospace'; c.fillText(label, px, py + 5);
  }
  for (const side of [-1, 1]) {
    for (let n = 0; n < 3; n++) {
      const a = side * (1.15 + n * .4);
      path([[a - .14, 5.5], [a, 5.72], [a + .14, 5.5]], side < 0 ? '#79e8fa' : '#ffe28e', 6);
    }
    c.save(); c.translate(x(side * 4.25), z(5.6)); c.rotate(side * -.58);
    c.fillStyle = '#692c81'; c.strokeStyle = '#fff0b8'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-28, -104); c.lineTo(35, 110); c.lineTo(-35, 110); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffe871'; c.font = 'bold 38px sans-serif'; c.fillText('★', 0, 50); c.restore();
  }
  for (let n = 0; n < 11; n++) {
    path([[4.98, 9.5 - n * .9], [5.18, 9.25 - n * .9], [5.38, 9.5 - n * .9]], '#8aedf4', 5);
  }
  // Brushed apron and cream rule cards, like a manufactured pinball cabinet.
  const apron = c.createLinearGradient(0, z(9), 0, 2048); apron.addColorStop(0, '#9c9c96'); apron.addColorStop(.3, '#41494c'); apron.addColorStop(1, '#21272d');
  c.fillStyle = apron; c.beginPath(); c.moveTo(0, z(9)); c.lineTo(x(-3.6), z(9)); c.lineTo(x(-2), z(10.15));
  c.lineTo(x(2), z(10.15)); c.lineTo(x(3.6), z(9)); c.lineTo(x(4.43), z(9)); c.lineTo(x(4.43), 2048); c.lineTo(0, 2048); c.closePath(); c.fill();
  for (let py = z(9.3); py < 2048; py += 3) { c.fillStyle = '#ffffff09'; c.fillRect(0, py, x(4.43), 1); }
  for (const side of [-1, 1]) {
    const cx = x(side * 3.9), cy = z(10.0);
    c.fillStyle = '#f0edda'; c.fillRect(cx - 85, cy - 75, 170, 135); c.strokeStyle = '#aba98f'; c.lineWidth = 2; c.strokeRect(cx - 80, cy - 70, 160, 125);
    c.fillStyle = '#323532'; c.font = 'bold 16px monospace'; c.fillText(side < 0 ? 'INSTRUCTIONS' : 'SCORING', cx, cy - 42);
    c.font = '12px monospace';
    const lines = side < 0 ? ['HOLD SPACE · RELEASE', 'A / D · FLIPPERS', '3 BALLS · ONE ORBIT'] : ['JET BUMPERS 100', 'BOOST TARGETS 250', circuitEnabled ? 'FULL CIRCUIT 750' : 'LIGHT THE REACTORS'];
    lines.forEach((line, i) => c.fillText(line, cx, cy - 10 + i * 20));
  }
  c.fillStyle = '#ffdc68'; c.font = 'bold 30px sans-serif'; c.fillText('ORBIT PINBALL', x(0), z(10.72));
  return texture(image);
}

/** One atlas supplies warm and cool star caps without a texture per bumper. */
export function bumperBadgeTexture() {
  const { image, c } = canvas(1024, 512);
  for (let tile = 0; tile < 2; tile++) {
    const cx = tile * 512 + 256;
    const cap = c.createRadialGradient(cx - 60, 190, 5, cx, 256, 255);
    cap.addColorStop(0, '#fffef2'); cap.addColorStop(.78, '#e8e4ce'); cap.addColorStop(1, '#b6b6a7');
    c.fillStyle = cap; c.fillRect(tile * 512, 0, 512, 512);
    c.strokeStyle = tile ? '#165d7a' : '#76511a'; c.lineWidth = 9; c.beginPath(); c.arc(cx, 256, 205, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (let n = 0; n < 10; n++) {
      const a = n * Math.PI / 5 - Math.PI / 2, r = n % 2 ? 67 : 158;
      n ? c.lineTo(cx + Math.cos(a) * r, 236 + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, 236 + Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = tile ? '#168dab' : '#dba211'; c.fill(); c.stroke();
    c.textAlign = 'center'; c.fillStyle = tile ? '#257d92' : '#916b17'; c.font = 'bold 32px monospace'; c.fillText('100', cx, 416);
  }
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

export function woodTexture() {
  const { image, c } = canvas(512, 256), rand = random(83);
  const finish = c.createLinearGradient(0, 0, 0, 256);
  finish.addColorStop(0, '#84502d'); finish.addColorStop(0.45, '#63351e'); finish.addColorStop(1, '#9b6037');
  c.fillStyle = finish; c.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 2) {
    c.strokeStyle = rand() > 0.6 ? '#efbc7c25' : '#32190935'; c.lineWidth = 0.5 + rand();
    c.beginPath(); c.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16) c.lineTo(x, y + Math.sin(x * 0.022 + y * 0.15) * (1 + rand() * 2));
    c.stroke();
  }
  return texture(image);
}

export function railTexture(wood = false) {
  const { image, c } = canvas(1024, 128);
  const rand = random(wood ? 83 : 91);
  const finish = c.createLinearGradient(0, 0, 0, 128);
  finish.addColorStop(0, wood ? '#875738' : '#626968');
  finish.addColorStop(1, wood ? '#654127' : '#494f50');
  c.fillStyle = finish; c.fillRect(0, 0, 1024, 128);
  // Fine, low-contrast grain stays subtle at grazing FPV angles instead of
  // turning the launch lane into two large ribbed walls.
  c.lineWidth = 0.5;
  for (let y = 0; y < 128; y += 2) {
    c.strokeStyle = wood ? y % 3 ? '#3523120a' : '#dfac700a' : y % 3 ? '#151b2208' : '#e0e2d30a';
    c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(330, y + rand() * 4, 660, y - rand() * 3, 1024, y); c.stroke();
  }
  c.fillStyle = '#111617'; c.fillRect(0, 93, 1024, 35);
  c.fillStyle = '#c6c5b7'; c.fillRect(0, 5, 1024, 4);
  c.fillStyle = '#8c989c'; c.fillRect(0, 89, 1024, 3);
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
