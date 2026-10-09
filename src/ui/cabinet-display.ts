import type { Phase } from '../physics/simulation';
import type { RoutePhase } from '../physics/route-state';

export interface DisplaySnapshot {
  phase: Phase; paused: boolean; score: number; balls: number; charge: number;
  circuit: boolean; coarse: boolean; route: { active: boolean; phase: RoutePhase };
}
export function cabinetDisplay(s: DisplaySnapshot) {
  const count = Math.max(0, Math.min(3, Math.floor(s.balls)));
  let status: string;
  if (s.phase === 'intro') status = 'ORBITAL ARCADE';
  else if (s.phase === 'over') status = 'GAME OVER';
  else if (s.paused) status = 'PAUSED';
  else if (s.phase === 'ready') status = s.charge > 0 ? 'RELEASE TO LAUNCH' : s.coarse ? 'HOLD LAUNCH · RELEASE TO FIRE' : 'HOLD SPACE · RELEASE TO FIRE';
  else if (s.phase === 'draining') status = 'BALL LOST · NEXT ORBIT';
  else if (s.route.active) status = `CIRCUIT / ${s.route.phase.toUpperCase()}`;
  else status = s.circuit ? 'LEFT RAMP → CIRCUIT +750' : 'REACTORS +100 · TARGETS +250';
  return {
    visible: s.phase !== 'intro', score: String(Math.max(0, Math.floor(s.score))).padStart(5, '0'),
    balls: Array.from({ length: 3 }, (_, i) => i < count ? '●' : '○').join(' '),
    ballLabel: `${count} ${count === 1 ? 'ball' : 'balls'} remaining`, status,
  };
}
