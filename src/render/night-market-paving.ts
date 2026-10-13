import * as THREE from 'three';
/** Original enamel paving and brass inlays. Geometry/physics remain authoritative. */
export function marketPaving(width=1024,height=2048){
 const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d')!;
 g.fillStyle='#14212b';g.fillRect(0,0,width,height);
 const colors=['#152e39','#2a1938','#253435','#292542'];
 for(let y=0;y<height;y+=64)for(let x=0;x<width;x+=64){g.fillStyle=colors[(x/64+y/64)%4];g.fillRect(x+2,y+2,60,60);g.strokeStyle='#b69e604f';g.lineWidth=1;g.strokeRect(x+4,y+4,56,56);g.beginPath();g.moveTo(x+32,y+9);g.lineTo(x+55,y+32);g.lineTo(x+32,y+55);g.lineTo(x+9,y+32);g.closePath();g.stroke();}
 for(let n=0;n<36;n++){let x=(n*137)%width;const gradient=g.createLinearGradient(x,0,x+18,0);gradient.addColorStop(0,'#ff459900');gradient.addColorStop(.5,n%2?'#2ef5dc25':'#ff459925');gradient.addColorStop(1,'#ff459900');g.fillStyle=gradient;g.fillRect(x,0,18,height);}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
export function routeInlay(){return marketPaving(256,1024);}
export function nightRouteTexture(){const map=routeInlay();map.wrapS=map.wrapT=THREE.RepeatWrapping;return map;}
export function mechanismInlayTexture(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!;g.fillStyle='#ddd8c6';g.fillRect(0,0,256,256);g.strokeStyle='#8e826c';g.lineWidth=2;for(let n=8;n<256;n+=16){g.strokeRect(n,n,256-2*n,256-2*n);}const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;}
