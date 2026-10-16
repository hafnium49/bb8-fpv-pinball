import { DoubleSide, MeshPhysicalMaterial } from 'three';

/** Lighter, low-saturation architectural base; sky, paving and neon are separate. */
export const WALL_BASE_COLOR = 0x74828c;
export const WALL_BASE_CSS = '#74828c';

/** Opaque lower subway wall, including the parts in front of the decorative vault.
 * A modest slate emission preserves the base in Eco without altering floor/neon maps.
 */
export function tunnelWallMaterial() {
  const material = new MeshPhysicalMaterial({
    color: WALL_BASE_COLOR, emissive: WALL_BASE_COLOR, emissiveIntensity: .35,
    metalness: .35, roughness: .24, clearcoat: 1, clearcoatRoughness: .12,
    side: DoubleSide,
  });
  material.name = 'Lighter subway wall base';
  return material;
}
