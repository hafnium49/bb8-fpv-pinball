import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** A single HDR resolve combines restrained emissive glow, tone mapping and output conversion. */
export class ArcadePost {
  readonly target: THREE.WebGLRenderTarget;
  readonly material = new THREE.ShaderMaterial({
    uniforms: { image: { value: null }, texel: { value: new THREE.Vector2(1, 1) } },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D image;
      uniform vec2 texel;
      varying vec2 vUv;
      vec3 bright(vec2 uv) {
        vec3 c = texture2D(image, uv).rgb;
        float light = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return c * smoothstep(2.0, 2.1, light);
      }
      void main() {
        vec3 c = texture2D(image, vUv).rgb;
        vec2 offset = texel * 3.0;
        vec3 glow = bright(vUv + vec2(offset.x, 0.0)) + bright(vUv - vec2(offset.x, 0.0))
          + bright(vUv + vec2(0.0, offset.y)) + bright(vUv - vec2(0.0, offset.y));
        gl_FragColor = vec4(c + glow * 0.0175, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private quad = new FullScreenQuad(this.material);

  constructor(renderer: THREE.WebGLRenderer) {
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('HDR glow requires a floating-point render target');
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    this.target.texture.name = 'Arcade HDR scene'; this.material.uniforms.image.value = this.target.texture;
  }
  resize(width: number, height: number) {
    this.target.setSize(width, height); this.material.uniforms.texel.value.set(1 / width, 1 / height);
  }
  async warmup(renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, this.material));
    try { await renderer.compileAsync(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); }
    finally { geometry.dispose(); }
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.target); renderer.render(scene, camera);
    renderer.setRenderTarget(null); this.quad.render(renderer);
  }
  dispose() { this.target.dispose(); this.material.dispose(); this.quad.dispose(); }
}
