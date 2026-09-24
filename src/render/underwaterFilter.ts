import { defaultFilterVert, Filter, GlProgram, UniformGroup } from "pixi.js";
import type { LightingId } from "../core";

// 水の揺らぎ・コースティクス・光の筋・照明の色調を1パスでまとめてかける。
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uInputClamp;

uniform float uTime;
uniform float uRipple;
uniform float uCaustics;
uniform float uRays;
uniform vec3 uGrade;
uniform float uExposure;
uniform float uSaturation;
uniform float uVignette;

float causticPattern(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float intensity = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / intensity), p.y / (cos(i.y + tt) / intensity)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

void main() {
  vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
  float aspect = uOutputFrame.z / uOutputFrame.w;

  vec2 wobble = vec2(
    sin(uv.y * 17.0 + uTime * 0.83) + 0.5 * sin(uv.y * 41.0 - uTime * 1.27),
    cos(uv.x * 13.0 + uTime * 0.71) + 0.5 * cos(uv.x * 29.0 + uTime * 1.09)
  ) * uRipple;
  vec2 coord = vTextureCoord + wobble * uOutputFrame.zw * uInputSize.zw;
  // 入力は乗算済みアルファ。ガラスの外（透明な余白）は透明のまま残す。
  vec4 source = texture(uTexture, clamp(coord, uInputClamp.xy, uInputClamp.zw));
  vec3 color = source.rgb;
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));

  vec2 causticUv = vec2(uv.x * aspect, uv.y * 1.35) * 5.5 + vec2(0.0, uTime * 0.012);
  float caustic = causticPattern(causticUv - 250.0, uTime * 0.32);
  float causticMask = smoothstep(1.05, 0.05, uv.y) * (0.35 + luminance * 1.6);
  color += color * caustic * uCaustics * causticMask + vec3(0.55, 0.85, 0.8) * caustic * uCaustics * 0.035 * source.a;

  float slant = uv.x * 1.0 + uv.y * 0.62;
  float shafts =
    pow(0.5 + 0.5 * sin(slant * 19.0 + uTime * 0.19), 7.0) * 0.7 +
    pow(0.5 + 0.5 * sin(slant * 31.0 - uTime * 0.13 + 1.7), 9.0) * 0.5 +
    pow(0.5 + 0.5 * sin(slant * 11.0 + uTime * 0.07 + 4.1), 5.0) * 0.4;
  float rayFade = smoothstep(0.95, 0.0, uv.y) * smoothstep(1.25, 0.05, uv.x) *
    (0.75 + 0.25 * sin(uTime * 0.23));
  color += vec3(0.62, 0.92, 0.86) * shafts * rayFade * uRays * source.a;

  color *= uGrade * uExposure;
  float gradedLuminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gradedLuminance), color, uSaturation);

  vec2 centered = (uv - 0.5) * vec2(aspect / 1.6, 1.0);
  color *= 1.0 - uVignette * smoothstep(0.32, 0.9, length(centered));

  finalColor = vec4(min(color, vec3(source.a)), source.a);
}
`;

type LightingLook = {
  ripple: number;
  caustics: number;
  rays: number;
  grade: [number, number, number];
  exposure: number;
  saturation: number;
  vignette: number;
};

// 効果なし。部屋で見ていた絵と同じ見た目から水中の見え方へ移るときの始点。
const NEUTRAL_LOOK: LightingLook = {
  ripple: 0, caustics: 0, rays: 0,
  grade: [1, 1, 1], exposure: 1, saturation: 1, vignette: 0,
};

const LOOKS: Record<LightingId, LightingLook> = {
  natural: {
    ripple: 0.0009, caustics: 0.42, rays: 0.075,
    grade: [1, 1, 1], exposure: 1, saturation: 1, vignette: 0.26,
  },
  cool: {
    ripple: 0.0009, caustics: 0.36, rays: 0.06,
    grade: [0.9, 1, 1.1], exposure: 1.03, saturation: 0.9, vignette: 0.24,
  },
  evening: {
    ripple: 0.0008, caustics: 0.26, rays: 0.1,
    grade: [1.14, 0.94, 0.76], exposure: 0.9, saturation: 0.96, vignette: 0.34,
  },
  night: {
    ripple: 0.0007, caustics: 0.06, rays: 0,
    grade: [0.46, 0.62, 0.95], exposure: 0.62, saturation: 0.7, vignette: 0.5,
  },
};

export class UnderwaterFilter extends Filter {
  private readonly uniforms: UniformGroup;
  private target: LightingLook;
  private readonly current: LightingLook;

  constructor(lighting: LightingId, options: { startNeutral?: boolean } = {}) {
    const look = options.startNeutral ? NEUTRAL_LOOK : LOOKS[lighting];
    const uniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uRipple: { value: look.ripple, type: "f32" },
      uCaustics: { value: look.caustics, type: "f32" },
      uRays: { value: look.rays, type: "f32" },
      uGrade: { value: new Float32Array(look.grade), type: "vec3<f32>" },
      uExposure: { value: look.exposure, type: "f32" },
      uSaturation: { value: look.saturation, type: "f32" },
      uVignette: { value: look.vignette, type: "f32" },
    });
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment,
        name: "underwater-filter",
        preferredFragmentPrecision: "highp",
      }),
      resources: { underwaterUniforms: uniforms },
      resolution: "inherit",
    });
    this.uniforms = uniforms;
    this.target = look;
    this.current = structuredClone(look);
  }

  /** null のときは効果なし（部屋で見ていた絵のまま）へ向かう。 */
  setLighting(lighting: LightingId | null) {
    this.target = lighting ? LOOKS[lighting] : NEUTRAL_LOOK;
  }

  update(timeSec: number, deltaSec: number) {
    const amount = 1 - Math.exp(-2.2 * deltaSec);
    const current = this.current;
    const target = this.target;
    current.ripple += (target.ripple - current.ripple) * amount;
    current.caustics += (target.caustics - current.caustics) * amount;
    current.rays += (target.rays - current.rays) * amount;
    current.exposure += (target.exposure - current.exposure) * amount;
    current.saturation += (target.saturation - current.saturation) * amount;
    current.vignette += (target.vignette - current.vignette) * amount;
    for (let index = 0; index < 3; index += 1) {
      current.grade[index]! += (target.grade[index]! - current.grade[index]!) * amount;
    }

    const values = this.uniforms.uniforms;
    values.uTime = timeSec;
    values.uRipple = current.ripple;
    values.uCaustics = current.caustics;
    values.uRays = current.rays;
    (values.uGrade as Float32Array).set(current.grade);
    values.uExposure = current.exposure;
    values.uSaturation = current.saturation;
    values.uVignette = current.vignette;
  }
}
