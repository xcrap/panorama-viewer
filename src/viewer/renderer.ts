import { FULLSCREEN_VERT, createProgram, uniformLocations } from "./gl";
import { basis, projScale, type View } from "./math";

/** How texture coordinates are derived from a view direction. */
export interface Mapping {
  /** 0 = equirectangular, 1 = cylindrical. */
  source: 0 | 1;
  /** u = u0 * x - y ; v = v0 * z - w  (handles crops and partial coverage). */
  map: [number, number, number, number];
  /** Cylindrical only: image aspect / horizontal coverage. */
  cylV: number;
  /** 1 on axes where the image has edges that should fade into the background. */
  mask: [number, number];
  /** Horizontal wrap-around (full 360°). */
  wrap: boolean;
}

const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uScale;
uniform float uD;
uniform int uSource;
uniform vec4 uMap;
uniform float uCylV;
uniform vec2 uMask;
uniform float uReady;
uniform vec3 uBg;
uniform vec3 uHatch;

out vec4 outColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

void main() {
  // Screen point -> ray, via a projection centre sitting uD behind the sphere centre.
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 P = vec2(ndc.x * uRes.x / uRes.y, ndc.y) * uScale;
  float D2 = dot(P, P) + 1.0;
  float t = (uD + sqrt(max(uD * uD - D2 * (uD * uD - 1.0), 0.0))) / D2;
  vec3 c = vec3(t * P, uD - t);
  vec3 dir = normalize(c.x * uRight + c.y * uUp - c.z * uFwd);

  float lon = atan(dir.x, -dir.z);
  float u0 = 0.5 + lon / TAU;
  float v0 = uSource == 0
    ? 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / PI
    : 0.5 - dir.y / max(length(dir.xz), 1e-5) * uCylV;

  // Pick whichever horizontal derivative doesn't straddle the ±180° seam,
  // so mip selection stays sane there.
  float u1 = fract(u0 + 0.5);
  float dxu = dFdx(u0), dyu = dFdy(u0);
  float dxu1 = dFdx(u1), dyu1 = dFdy(u1);
  if (abs(dxu1) < abs(dxu)) dxu = dxu1;
  if (abs(dyu1) < abs(dyu)) dyu = dyu1;

  vec2 uv = vec2(u0 * uMap.x - uMap.y, v0 * uMap.z - uMap.w);
  vec2 gx = vec2(dxu * uMap.x, dFdx(v0) * uMap.z);
  vec2 gy = vec2(dyu * uMap.x, dFdy(v0) * uMap.z);
  vec3 col = textureGrad(uTex, uv, gx, gy).rgb;

  vec2 fw = vec2(abs(gx.x) + abs(gy.x), abs(gx.y) + abs(gy.y)) + 1e-6;
  vec2 edge = clamp(min(uv, 1.0 - uv) / fw + 0.5, 0.0, 1.0);
  float inside = mix(1.0, edge.x, uMask.x) * mix(1.0, edge.y, uMask.y) * uReady;

  // Outside the photo: survey hatching.
  float stripe = step(mod(gl_FragCoord.x + gl_FragCoord.y, 9.0 * uDpr), uDpr);
  vec3 bg = mix(uBg, uHatch, stripe * uReady);
  outColor = vec4(mix(bg, col, inside), 1.0);
}`;

const UNIFORMS = [
  "uTex",
  "uRes",
  "uDpr",
  "uFwd",
  "uRight",
  "uUp",
  "uScale",
  "uD",
  "uSource",
  "uMap",
  "uCylV",
  "uMask",
  "uReady",
  "uBg",
  "uHatch",
] as const;

export class PanoRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxTextureSize: number;
  dirty = true;
  dpr = 1;

  private program: WebGLProgram;
  private u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture | null = null;
  private mapping: Mapping = { source: 0, map: [1, 0, 1, 0], cylV: 0, mask: [0, 0], wrap: true };
  private aniso: number;
  private anisoExt: EXT_texture_filter_anisotropic | null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    this.u = uniformLocations(gl, this.program, UNIFORMS);
    this.vao = gl.createVertexArray()!;
    this.anisoExt = gl.getExtension("EXT_texture_filter_anisotropic");
    this.aniso = this.anisoExt
      ? Math.min(8, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 1;
  }

  setImage(source: TexImageSource) {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisoExt) {
      gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, this.aniso);
    }
    this.texture = tex;
    this.applyWrap();
    this.dirty = true;
  }

  clearImage() {
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = null;
    this.dirty = true;
  }

  setMapping(mapping: Mapping) {
    this.mapping = mapping;
    this.applyWrap();
    this.dirty = true;
  }

  private applyWrap() {
    if (!this.texture) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      this.mapping.wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE,
    );
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dirty = true;
  }

  render(view: View) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    const { fwd, right, up } = basis(view.yaw, view.pitch);
    const m = this.mapping;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uRes, width, height);
    gl.uniform1f(this.u.uDpr, this.dpr);
    gl.uniform3fv(this.u.uFwd, fwd);
    gl.uniform3fv(this.u.uRight, right);
    gl.uniform3fv(this.u.uUp, up);
    gl.uniform1f(this.u.uScale, projScale(view.fov, view.d));
    gl.uniform1f(this.u.uD, view.d);
    gl.uniform1i(this.u.uSource, m.source);
    gl.uniform4fv(this.u.uMap, m.map);
    gl.uniform1f(this.u.uCylV, m.cylV);
    gl.uniform2fv(this.u.uMask, m.mask);
    gl.uniform1f(this.u.uReady, this.texture ? 1 : 0);
    gl.uniform3f(this.u.uBg, 0x23 / 255, 0x22 / 255, 0x21 / 255);
    gl.uniform3f(this.u.uHatch, 0x2c / 255, 0x2b / 255, 0x29 / 255);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dirty = false;
  }

  dispose() {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.texture = null;
  }
}
