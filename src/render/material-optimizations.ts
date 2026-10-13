import type * as THREE from 'three';

const optimized = new WeakSet<THREE.MeshStandardMaterial>();

/** Reuse a sample only when both slots refer to the exact same texture/UV transform.
 * Geometry, lighting, tone mapping, color space and authored material values stay intact.
 * Apply after material construction and before renderer warm-up. The shared texture
 * slots must remain paired for the lifetime of the material (as our static artwork does).
 */
export function reuseMaterialSamples(material: THREE.MeshStandardMaterial) {
  if (optimized.has(material)) return false;
  const color = !!material.map && material.map === material.emissiveMap;
  const properties = !!material.roughnessMap && material.roughnessMap === material.metalnessMap;
  if (!color && !properties) return false;
  optimized.add(material);
  const original = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    original(shader, renderer);
    if (color) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#ifdef USE_EMISSIVEMAP\n totalEmissiveRadiance *= sampledDiffuseColor.rgb;\n#endif');
    if (properties) shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      'float metalnessFactor = metalness;\n#ifdef USE_METALNESSMAP\n metalnessFactor *= texelRoughness.b;\n#endif');
  };
  material.customProgramCacheKey = () => `${key}-shared-samples-${Number(color)}${Number(properties)}-v1`;
  material.needsUpdate = true;
  return true;
}

/** The back of a low ramp has no direct sky light; keep its inlaid art legible.
 * This changes emission only on the underside, without adding a duplicate face.
 */
export function illuminateBackFace(material: THREE.MeshStandardMaterial, factor: number) {
  if (!Number.isFinite(factor) || factor < 1) throw new Error('Back-face emission factor must be finite and at least one');
  const original=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    original(shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance *= gl_FrontFacing ? 1.0 : ${factor.toFixed(4)};`);
  };
  material.customProgramCacheKey=()=>`${key}-back-emission-${factor.toFixed(4)}`;
  material.needsUpdate=true;
}
