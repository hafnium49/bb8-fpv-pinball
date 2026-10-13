import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export const bloomSize = (width: number, height: number) => [Math.max(1, Math.ceil(width / 4)), Math.max(1, Math.ceil(height / 4))] as const;
export const supportedHdrSamples = (color: readonly number[], depth: readonly number[], maximum: number) =>
  [2, 4].find(n => n <= maximum && color.includes(n) && depth.includes(n)) ?? 0;

/** Small HDR bloom buffers soften real luminous details without blurring the scene. */
export class ArcadePost {
  readonly target: THREE.WebGLRenderTarget;
  readonly bloomA: THREE.WebGLRenderTarget;
  readonly bloomB: THREE.WebGLRenderTarget;
  readonly material = new THREE.ShaderMaterial({
    uniforms: { image: { value: null }, bloom: { value: null }, strength: { value: .22 } },
    depthTest: false, depthWrite: false, vertexShader,
    fragmentShader: `
      uniform sampler2D image;
      uniform sampler2D bloom;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(image, vUv).rgb;
        gl_FragColor = vec4(c + texture2D(bloom, vUv).rgb * strength, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private extract = new THREE.ShaderMaterial({
    uniforms: { image: { value: null }, texel: { value: new THREE.Vector2() } },
    depthTest: false, depthWrite: false, toneMapped: false, vertexShader,
    fragmentShader: `
      uniform sampler2D image;
      uniform vec2 texel;
      varying vec2 vUv;
      vec3 bright(vec2 uv) {
        vec3 c = texture2D(image, uv).rgb;
        return c * smoothstep(.9, 1.6, max(c.r, max(c.g, c.b)));
      }
      void main() {
        vec3 c = bright(vUv + texel) + bright(vUv - texel)
          + bright(vUv + vec2(texel.x, -texel.y)) + bright(vUv + vec2(-texel.x, texel.y));
        gl_FragColor = vec4(c * .25, 1.0);
      }`,
  });
  private blur = new THREE.ShaderMaterial({
    uniforms: { image: { value: null }, direction: { value: new THREE.Vector2() } },
    depthTest: false, depthWrite: false, toneMapped: false, vertexShader,
    fragmentShader: `
      uniform sampler2D image;
      uniform vec2 direction;
      varying vec2 vUv;
      void main() {
        // Bilinear five-fetch form of a normalized nine-tap Gaussian.
        vec3 c = texture2D(image, vUv).rgb * .227027;
        c += (texture2D(image, vUv + direction * 1.384615).rgb
          + texture2D(image, vUv - direction * 1.384615).rgb) * .316216;
        c += (texture2D(image, vUv + direction * 3.230769).rgb
          + texture2D(image, vUv - direction * 3.230769).rgb) * .070270;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  private quad = new FullScreenQuad(this.material);
  constructor(renderer: THREE.WebGLRenderer) {
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('HDR glow requires a floating-point render target');
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    const gl = renderer.getContext();
    // Global MAX_SAMPLES alone does not guarantee that the HDR/depth formats match.
    if ('getInternalformatParameter' in gl) {
      const colorSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array);
      const depthSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) as Int32Array);
      this.target.samples = supportedHdrSamples(colorSamples, depthSamples, Math.min(2, renderer.capabilities.maxSamples));
    }
    this.target.resolveDepthBuffer = false;
    this.target.texture.name = 'Arcade HDR scene';
    const bloom = () => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.bloomA = bloom(); this.bloomB = bloom();
    this.bloomA.texture.name = 'Neon quarter-resolution bloom A'; this.bloomB.texture.name = 'Neon quarter-resolution bloom B';
    this.material.uniforms.image.value = this.target.texture; this.material.uniforms.bloom.value = this.bloomA.texture;
    this.extract.uniforms.image.value = this.target.texture;
  }
  resize(width: number, height: number) {
    this.target.setSize(width, height);
    const [w, h] = bloomSize(width, height); this.bloomA.setSize(w, h); this.bloomB.setSize(w, h);
    this.extract.uniforms.texel.value.set(1 / width, 1 / height);
  }
  async warmup(renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(geometry, this.material); scene.add(mesh);
    const previous = renderer.getRenderTarget();
    try {
      for (const material of [this.extract, this.blur, this.material]) {
        mesh.material = material; renderer.setRenderTarget(material === this.material ? null : this.bloomA);
        await renderer.compileAsync(scene, camera);
      }
    } finally { renderer.setRenderTarget(previous); geometry.dispose(); }
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.target); renderer.render(scene, camera);
    this.quad.material = this.extract; renderer.setRenderTarget(this.bloomA); this.quad.render(renderer);
    this.quad.material = this.blur;
    this.blur.uniforms.image.value = this.bloomA.texture; this.blur.uniforms.direction.value.set(1 / this.bloomA.width, 0);
    renderer.setRenderTarget(this.bloomB); this.quad.render(renderer);
    this.blur.uniforms.image.value = this.bloomB.texture; this.blur.uniforms.direction.value.set(0, 1 / this.bloomB.height);
    renderer.setRenderTarget(this.bloomA); this.quad.render(renderer);
    this.quad.material = this.material; renderer.setRenderTarget(null); this.quad.render(renderer);
  }
  dispose() {
    this.target.dispose(); this.bloomA.dispose(); this.bloomB.dispose();
    this.material.dispose(); this.extract.dispose(); this.blur.dispose(); this.quad.dispose();
  }
}
