import type { PinballSimulation } from '../physics/simulation';
import { FLIPPER_LENGTH, bumpers, flippers, rails, targets } from '../physics/table';

export function drawMinimap(canvas: HTMLCanvasElement, sim: PinballSimulation, heading: number) {
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / 13, sz = canvas.height / 23;
  const x = (v: number) => (v + 6.5) * sx, z = (v: number) => (v + 11.5) * sz;
  c.fillStyle = '#0c1935e0'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = '#537bab'; c.lineWidth = 2;
  for (const r of rails) { c.beginPath(); c.moveTo(x(r.ax), z(r.az)); c.lineTo(x(r.bx), z(r.bz)); c.stroke(); }
  for (const [i, b] of bumpers.entries()) { c.fillStyle = i === 1 ? '#74d9e6' : '#ffad55'; c.beginPath(); c.arc(x(b.x), z(b.z), b.radius * sx, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#74d9e6'; for (const t of targets) c.fillRect(x(t.x) - 2, z(t.z) - sz * 0.7, 4, sz * 1.4);
  c.lineWidth = 4; c.lineCap = 'round';
  for (const [i, f] of flippers.entries()) {
    const angle = sim.flipperAngles[i]; c.strokeStyle = i === 0 ? '#74d9e6' : '#ffad55';
    c.beginPath(); c.moveTo(x(f.x), z(f.z)); c.lineTo(x(f.x + f.side * FLIPPER_LENGTH * Math.cos(angle)), z(f.z - f.side * FLIPPER_LENGTH * Math.sin(angle))); c.stroke();
  }
  if (sim.phase !== 'over' && sim.phase !== 'draining') {
    const p = sim.position; c.fillStyle = '#ffffff'; c.shadowColor = '#ffffff'; c.shadowBlur = 8;
    c.beginPath(); c.arc(x(p.x), z(p.z), 4, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    c.strokeStyle = '#ffffff88'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x(p.x), z(p.z)); c.lineTo(x(p.x + Math.sin(heading) * 1.3), z(p.z - Math.cos(heading) * 1.3)); c.stroke();
  }
}
