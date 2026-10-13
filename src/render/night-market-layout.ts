export interface MarketFront { x:number;z:number;angle:number;width:number;height:number;tile:number;district:number }
export function marketFronts(reference:boolean) {
  const fronts:MarketFront[]=[];
  const add=(x:number,z:number,angle:number,width:number,district:number)=>{const n=fronts.length;fronts.push({x,z,angle,width,height:1.8+((n*7)%9)*.105,tile:(n*7+district*3)%16,district});};
  const first=reference?-5.32:-10.9,last=reference?11.52:10.9;
  for(const side of [-1,1]) {const count=reference?13:17,step=(last-first)/count;for(let i=0;i<count;i++)add(side*(reference?6.39:6.19),first+(i+.5)*step,-side*Math.PI/2,step*1.015,side<0?0:1);}
  if(reference)for(let i=0;i<17;i++){const a=Math.PI+(i+.5)/17*Math.PI;add(Math.cos(a)*6.31,-5.32+Math.sin(a)*6.31,Math.atan2(-Math.cos(a),-Math.sin(a)),2*6.31*Math.sin(Math.PI/17/2)*1.015,2);}
  else for(let i=0;i<9;i++)add(-5.5+i*1.375,-11.15,0,1.4,2);
  for(let i=0;i<9;i++)add(-5.6+i*1.4,reference?11.77:11.2,Math.PI,1.42,3);
  return fronts;
}
export const marketGlow=(time:number,channel:number,reduced:boolean)=>reduced?1.6:1.25+.45*Math.sin(time*1.45-channel*Math.PI/3);
export function simplifyLightPath<T extends {x:number;y:number;z:number}>(points:T[],tolerance:number):T[]{
 if(points.length<3)return points.slice();const a=points[0],b=points.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=dx*dx+dy*dy+dz*dz;let max=tolerance*tolerance,index=-1;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/l)):0,d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2+(p.z-a.z-t*dz)**2;if(d>max){max=d;index=i;}}
 return index<0?[a,b]:[...simplifyLightPath(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyLightPath(points.slice(index),tolerance)];
}
export const tunnelVaultFits=(centerY:number)=>centerY<=-.48;
