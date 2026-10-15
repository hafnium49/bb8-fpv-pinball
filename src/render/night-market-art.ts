import * as THREE from 'three';
import { WALL_BASE_CSS } from './wall-palette';
export const marketColors=[0xff4599,0x2ef5dc,0xffc15a,0x9082ff,0x64c5ff,0xd8fb81];
const ink=['#ff4599','#2ef5dc','#ffc15a','#9082ff','#64c5ff','#d8fb81'];
const shops=['PALM','MOON','ORBIT','LOTUS','SODA','WAVE','JADE','MANGO','COMET','PEARL','TIGER','NOVA','RUBY','LUNA','GLOW','CORAL'];
function texture(canvas:HTMLCanvasElement){const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;}
function canvas(w:number,h:number){const image=document.createElement('canvas');image.width=w;image.height=h;return image;}
/** Original procedural sign art. No external photographs, trademarks, or font downloads. */
export function nightMarketAtlas(){
 const image=canvas(2048,2048),c=image.getContext('2d')!;
 shops.forEach((name,i)=>{const x=i%4*512,y=Math.floor(i/4)*512,color=ink[i%6];c.save();c.translate(x,y);c.fillStyle='#101a31';c.fillRect(0,0,512,512);const bg=c.createLinearGradient(0,0,512,512);bg.addColorStop(0,'#192948');bg.addColorStop(1,'#190e29');c.fillStyle=bg;c.fillRect(8,8,496,496);
 c.strokeStyle=color;c.lineWidth=7;c.strokeRect(20,20,472,472);c.lineWidth=2;c.strokeRect(31,31,450,450);c.shadowColor=color;c.shadowBlur=14;c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.font=`900 ${name.length>5?63:78}px sans-serif`;c.fillText(name,256,332);c.shadowBlur=0;c.font='20px monospace';c.fillStyle='#ecddca';c.fillText(['NIGHT MARKET','OPEN LATE','TROPICAL CLUB','AFTER HOURS'][i%4],256,400);
 c.save();c.translate(256,174);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=8;
 for(let k=0;k<6+i%5;k++){c.save();c.rotate(k*Math.PI*2/(6+i%5));c.beginPath();if(i%4===0){c.moveTo(0,0);c.quadraticCurveTo(52,-75,104,0);c.quadraticCurveTo(58,-22,0,0);}else if(i%4===1){c.moveTo(0,-103);c.lineTo(25,-40);c.lineTo(0,-20);}else if(i%4===2){c.ellipse(0,-50,18,51,0,0,Math.PI*2);}else{c.arc(0,-60,20,0,Math.PI*1.6);}c.stroke();c.restore();}
 c.beginPath();c.arc(0,0,17+i%3*8,0,Math.PI*2);c.fill();c.restore();c.restore();});return texture(image);
}
export function nightMarketInlayAtlas(){
 const image=canvas(2048,2048),c=image.getContext('2d')!;
 for(let i=0;i<16;i++){c.save();c.translate(i%4*512,Math.floor(i/4)*512);c.fillStyle=WALL_BASE_CSS;c.fillRect(0,0,512,512);c.strokeStyle=ink[i%6];c.lineWidth=4;c.strokeRect(10,10,492,492);c.strokeStyle='#d6ad68';c.lineWidth=2;
 for(let y=32;y<512;y+=64)for(let x=32;x<512;x+=64){c.save();c.translate(x,y);c.rotate((i%4)*Math.PI/8);c.beginPath();if(i%3===0){c.moveTo(0,-27);c.lineTo(27,0);c.lineTo(0,27);c.lineTo(-27,0);c.closePath();}else if(i%3===1){c.arc(0,0,24,0,Math.PI*2);c.moveTo(-24,0);c.lineTo(24,0);}else{c.moveTo(-26,-26);c.lineTo(26,26);c.moveTo(26,-26);c.lineTo(-26,26);}c.stroke();c.fillStyle=ink[(i+2)%6];c.fillRect(-3,-3,6,6);c.restore();}c.restore();}return texture(image);
}
export function atlasFace(w:number,h:number,tile:number){const geometry=new THREE.PlaneGeometry(w,h),uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%4+uv.getX(i))/4,1-(Math.floor(tile/4)+1-uv.getY(i))/4);return geometry;}
export function nightMarketSky(){const image=canvas(32,256),c=image.getContext('2d')!,g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'#030717');g.addColorStop(.55,'#141935');g.addColorStop(1,'#472843');c.fillStyle=g;c.fillRect(0,0,32,256);return texture(image);}
