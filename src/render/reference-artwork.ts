import * as THREE from 'three';
import data from '../physics/reference-course-data.json';
/** Original artwork placed at the reference's board landmarks, rather than
* reusing the old ORBIT texture's unrelated bumper/route positions. */
export function referencePlayfield() {
  const image = document.createElement('canvas');
  image.width = 1024;
  image.height = 2048;
  const c = image.getContext('2d')!;
  c.scale(1024 / 480, 2048 / 820);
  const bg = c.createLinearGradient(0, 0, 420, 820);
  bg.addColorStop(0, '#1b1637');
  bg.addColorStop(.38, '#554070');
  bg.addColorStop(.75, '#6a3865');
  bg.addColorStop(1, '#231936');
  c.fillStyle = bg;
  c.fillRect(0, 0, 480, 820);
  const glow = c.createRadialGradient(220, 285, 0, 220, 285, 320);
  glow.addColorStop(0, '#b6a7fa4f');
  glow.addColorStop(1, '#19133700');
  c.fillStyle = glow;
  c.fillRect(0, 0, 480, 820);
  let seed = 49;
  const rand = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 800; i++) {
    c.fillStyle = `rgba(255,244,255,${.15 + rand() * .7})`;
    const x = rand() * 480, y = rand() * 820, r = rand() > .95 ? 1.4 : .45;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = '#d9b96088';
  c.lineWidth = .8;
  for (const r of [130, 154, 175]) {
    c.beginPath();
    c.arc(220, 285, r, 0, Math.PI * 2);
    c.stroke();
  }
  for (let arm = 0; arm < 4; arm++) {
    c.beginPath();
    for (let i = 0; i < 140; i++) {
      const a = i / 140 * Math.PI * 3 + arm * Math.PI / 2, r = 2 + i * .22, x = 128 + Math.cos(a) * r, y = 338 + Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = arm % 2 ? '#eadcfc' : '#ac8bda';
    c.lineWidth = 2;
    c.stroke();
  }
  c.textAlign = 'center';
  c.font = 'bold 4px sans-serif';
  c.fillStyle = '#eee1fc';
  c.fillText('GRAVITY WELL', 128, 381);
  c.strokeStyle = '#e6c55f';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(146, 545);
  c.lineTo(294, 545);
  c.lineTo(220, 682);
  c.closePath();
  c.stroke();
  const lamp = (x: number, y: number, r: number, color: string, label: string) => { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f3ead2'; c.font = 'bold 4.5px monospace'; c.fillText(label, x, y + 1.5); };
  for (const [i, label] of ['2x', '3x', '4x', '5x'].entries())
    lamp(178 + i * 28, 526, 11, i ? '#846370' : '#e798c1', label);
  lamp(220, 578, 15, '#c5ba77', 'EXTRA');
  lamp(220, 578 + 7, 0, '#c5ba77', 'BALL');
  lamp(220, 622, 12, '#76a496', 'MULTI');
  c.font = 'bold 5px monospace';
  c.fillStyle = '#e8c353';
  c.fillText('BONUS MULTIPLIER', 220, 504);
  const arrow = (x: number, y: number, color: string, angle = 0) => { c.save(); c.translate(x, y); c.rotate(angle); c.fillStyle = color; c.beginPath(); c.moveTo(0, -5); c.lineTo(6, 4); c.lineTo(-6, 4); c.closePath(); c.fill(); c.restore(); };
  for (const [i, r] of data.ramps.entries())
    for (let j = 0; j < 3; j++)
      arrow(r.pts[0][0], r.pts[0][1] + 24 + j * 16, i === 0 ? '#eace58' : i === 1 ? '#87d7ec' : '#d6ce55');
  for (let i = 0; i < 3; i++)
    arrow(330, 382 + i * 32, '#ffde43', Math.PI / 2);
  for (const side of [0, 1]) {
    const x = side ? 391 : 49;
    lamp(x, 637, 7, '#b1c874', side ? 'R' : 'L');
    lamp(side ? 410 : 30, 677, 7, '#decf4e', 'K');
  }
  // The launch lane, printed at its actual x=440 position.
  for (let i = 0; i < 16; i++)
    lamp(440, 340 + i * 24, 2.3, '#87e7eb', '');
  const apron = c.createLinearGradient(0, 694, 0, 820);
  apron.addColorStop(0, '#a4aca8');
  apron.addColorStop(.25, '#5a6065');
  apron.addColorStop(1, '#252c35');
  c.fillStyle = apron;
  c.beginPath();
  c.moveTo(20, 664);
  c.lineTo(126, 700);
  c.lineTo(138, 750);
  c.lineTo(177, 787);
  c.lineTo(263, 787);
  c.lineTo(302, 750);
  c.lineTo(314, 700);
  c.lineTo(420, 664);
  c.lineTo(420, 820);
  c.lineTo(20, 820);
  c.closePath();
  c.fill();
  for (let y = 700; y < 820; y += 2) {
    c.fillStyle = '#ffffff0a';
    c.fillRect(20, y, 400, .45);
  }
  for (const [x, title, lines] of [[82, 'INSTRUCTIONS', ['A / D · BOTH DECKS', 'SPACE · HOLD / RELEASE', 'THREE RAMPS · THREE BALLS']], [363, 'SCORING', ['LEFT RAMP  1,000', 'WIRE RAMP  1,500', 'SKY RAMP  2,500', 'GRAVITY WELL  5,000']]] as const) {
    c.fillStyle = '#e8e4cb';
    c.fillRect(x - 44, 727, 88, 71);
    c.strokeStyle = '#9e9c89';
    c.lineWidth = .8;
    c.strokeRect(x - 42, 729, 84, 67);
    c.fillStyle = '#333630';
    c.font = 'bold 5.2px monospace';
    c.fillText(title, x, 739);
    c.font = '3.7px monospace';
    lines.forEach((line, i) => c.fillText(line, x, 754 + i * 9));
  }
  c.font = 'bold 11px sans-serif';
  c.fillStyle = '#f4ce3f';
  c.fillText('PINBALL', 220, 810);
  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
export function referenceDeckArtwork() {
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 512;
  const c = image.getContext('2d')!;
  c.fillStyle = '#263765';
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = '#668bc55c';
  c.lineWidth = 2;
  for (let i = 0; i <= 512; i += 32) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i, 512);
    c.moveTo(0, i);
    c.lineTo(512, i);
    c.stroke();
  }
  c.font = 'bold 23px sans-serif';
  c.fillStyle = '#e1d497';
  c.textAlign = 'center';
  c.fillText('UPPER DECK', 256, 480);
  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
