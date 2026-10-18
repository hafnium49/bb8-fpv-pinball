import * as THREE from 'three';
import data from '../physics/reference-course-data.json';

/** Local spike only. Existing look is the default; no simulation state is read. */
export type FidelityMode = 'baseline' | 'baked' | 'roughness';
export function fidelityMode(search: string): FidelityMode {
  const mode = new URLSearchParams(search).get('fidelity');
  return mode === 'baked' || mode === 'roughness' ? mode : 'baseline';
}
export const contactFootprints = [...data.bumpers, ...data.posts].map(p => ({x:p.x, y:p.y, radius:p.r}));

/** Artist-style contact approximation, not a physically traced lightmap.
 * Drawn once into the existing 480x820 artwork coordinate system. Only fixed
 * ground-level mechanisms are used; never paint a moving ball/flipper shadow.
 */
export function bakeGroundContacts(c: CanvasRenderingContext2D) {
  c.save();
  for (const p of contactFootprints) {
    const radius = p.radius + 8;
    const shadow = c.createRadialGradient(p.x,p.y,p.radius*.65,p.x,p.y,radius);
    shadow.addColorStop(0,'rgba(3,8,16,.52)');
    shadow.addColorStop(.55,'rgba(3,8,16,.20)');
    shadow.addColorStop(1,'rgba(3,8,16,0)');
    c.fillStyle=shadow;c.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
  }
  c.restore();
}

/** Linear-data roughness: restrained glaze variation and broad tile seams.
 * Deliberately no subpixel normals, extra lights, geometry, or screen passes.
 */
export function glazePixels(width=256,height=512) {
  const pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const tileX=Math.floor(x/16),tileY=Math.floor(y/16);
    const seed=((tileX*73856093)^(tileY*19349663))>>>0;
    const seam=x%16===0||y%16===0;
    const roughness=seam?.48:.23+(seed%9)/100;
    const v=Math.round(roughness*255),i=(y*width+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
  }
  return pixels;
}
export function glazeRoughness() {
  const texture=new THREE.DataTexture(glazePixels(),256,512);
  texture.colorSpace=THREE.NoColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  texture.name='FPV spike baked glaze roughness';
  return texture;
}
