export interface Point3 { x: number; y: number; z: number }

/** Ground eye .595 plus the camera's .25 swept envelope and a small margin. */
export const bridgePendantFits = (centerY: number) => centerY - .46 - .014 >= .85;

const segmentDistanceSquared = (p: Point3, a: Point3, b: Point3) => {
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/length)) : 0;
  return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2+(p.z-a.z-dz*t)**2;
};

/** Keep optional hanging trim away from every guided eye path, including crossings.
 * Samples are at most .08 apart; .30 covers the .25 camera envelope plus sampling.
 */
export function tubeClearsRouteEyes(points: Point3[], eyes: Point3[], radius: number) {
  const minimum=(.30+radius)**2;
  return eyes.every(eye=>points.slice(1).every((b,i)=>segmentDistanceSquared(eye,points[i],b)>=minimum));
}

/** Exact distance to a vertical rectangular sign, not merely its centre. */
export function signClearsRouteEyes(center: Point3, tangent: {x:number;z:number}, width: number, height: number, eyes: Point3[]) {
  const n=Math.hypot(tangent.x,tangent.z),x=tangent.x/n,z=tangent.z/n;
  return eyes.every(eye=>{
    const dx=eye.x-center.x,dy=eye.y-center.y,dz=eye.z-center.z;
    const along=Math.max(0,Math.abs(dx*x+dz*z)-width/2),vertical=Math.max(0,Math.abs(dy)-height/2),normal=-dx*z+dz*x;
    return along*along+vertical*vertical+normal*normal>=.30**2;
  });
}
