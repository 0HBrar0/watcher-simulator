// One shader for every solid and gas world. Textured and baked-procedural planets arrive here
// with the same inputs; differences come from uniforms set in planetData.ts.
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vDir;
varying vec2 vUv;

uniform sampler2D uMap;
uniform sampler2D uEmissive;
uniform sampler2D uSpecular;
uniform sampler2D uClouds;
uniform sampler2D uRingMap;
uniform bool uHasEmissive;
uniform bool uHasSpecular;
uniform bool uHasClouds;
uniform bool uNightOnly;
uniform bool uAlphaIsHeight;
uniform bool uDetail;
uniform vec3 uSun;
uniform vec3 uCentre;
uniform vec3 uAtmosphere;
uniform vec3 uRingNormal;
uniform vec2 uRing; // inner, outer in world units; 0 when absent
uniform bool uHasRingMap;
uniform float uRadius;
uniform float uBump;
uniform float uFlow;
uniform float uFlat;
uniform float uGlint;
uniform float uDisplace;
uniform float uCloudTurn;
uniform float uTime;
uniform float uHover;

void main() {
  vec2 uv = vUv;
  vec3 V = normalize(cameraPosition - vWorld);
  float camDist = length(cameraPosition - vWorld);

  if (uFlow > 0.0) {
    // Bands drift at different rates, with a slow turbulent shear between them.
    float lat = uv.y * 3.14159;
    float shear = sin(lat * 13.0) * 0.5 + sin(lat * 29.0 + 1.0) * 0.26;
    uv.x += uFlow * uTime * (0.00022 + 0.00018 * shear);
    float t = uTime * 0.012;
    vec3 flowP = vDir * vec3(6.0, 16.0, 6.0);
    uv += uFlow * 0.0016 * (vec2(vnoise(flowP + t), vnoise(flowP.zyx - t + 5.0)) - 0.5);
  }

  vec4 tex = texture2D(uMap, uv);
  vec3 albedo = tex.rgb;
  albedo = pow(albedo, vec3(uFlow > 0.0 ? 1.45 : 1.12));
  float height = uAlphaIsHeight ? tex.a : dot(albedo, vec3(0.3, 0.55, 0.15));

  float spec = uHasSpecular ? texture2D(uSpecular, uv).r : 0.0;
  if (uAlphaIsHeight && uGlint > 0.0) spec = 1.0 - smoothstep(0.3, 0.42, height);

  // Procedural grain fades in as you get close, so textures never turn to mush.
  vec3 Nbase = normalize(vNormalW);
  if (uDisplace > 0.0) Nbase = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (uDisplace > 0.0 && dot(Nbase, V) < 0.0) Nbase = -Nbase;

  float closeness = 0.0;
  if (uDetail) closeness = 1.0 - smoothstep(uRadius * 0.6, uRadius * 4.0, camDist - uRadius);
  if (closeness > 0.0 && uBump > 0.0) {
    float grain = fbm(vDir * 90.0, 4) - 0.5;
    float grain2 = vnoise(vDir * 520.0) - 0.5;
    height += (grain * 0.1 + grain2 * 0.03) * closeness * (1.0 - spec);
    albedo *= 1.0 + (grain * 0.34 + grain2 * 0.1) * closeness * (1.0 - spec);
  }

  // Screen-space bump from whatever height we have.
  vec3 N = Nbase;
  if (uBump > 0.0) {
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    float hx = dFdx(height), hy = dFdy(height);
    vec3 r1 = cross(dpy, Nbase), r2 = cross(Nbase, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    float amount = uBump * uRadius * 0.018 * (1.0 - spec * 0.92);
    N = normalize(abs(det) * Nbase - amount * grad);
  }

  vec3 L = normalize(uSun - vWorld);
  float NdL = dot(N, L);
  float NdV = max(dot(N, V), 0.0);
  float geo = dot(Nbase, L);

  // A wide, soft terminator reads as atmosphere; airless bodies get a harsher flat-disc law.
  float wrap = mix(0.1, 0.0, uFlat);
  float diffuse = clamp((NdL + wrap) / (1.0 + wrap), 0.0, 1.0);
  diffuse = pow(diffuse, mix(1.08, 0.72, uFlat));
  float limbFlat = max(NdL, 0.0) / (max(NdL, 0.0) + NdV + 0.001) * 2.0;
  diffuse = mix(diffuse, limbFlat, uFlat * 0.7);
  diffuse *= smoothstep(-0.1, 0.16, geo);

  float shadow = 1.0;
  if (uHasClouds) {
    vec2 cuv = vUv + vec2(uCloudTurn, 0.0) - (L - N * dot(N, L)).xz * 0.0012;
    shadow *= 1.0 - 0.56 * texture2D(uClouds, cuv).r * smoothstep(0.0, 0.2, geo);
  }

  if (uRing.y > 0.0) {
    // The shadow the rings cast across the globe.
    float denom = dot(L, uRingNormal);
    if (abs(denom) > 1e-4) {
      float t = dot(uCentre - vWorld, uRingNormal) / denom;
      if (t > 0.0) {
        float r = length(vWorld + L * t - uCentre);
        float u = (r - uRing.x) / (uRing.y - uRing.x);
        if (u > 0.0 && u < 1.0) {
          float k = uHasRingMap ? texture2D(uRingMap, vec2(u, 0.5)).a : 0.55;
          shadow *= 1.0 - k * 0.78;
        }
      }
    }
  }

  vec3 sunColor = vec3(1.0, 0.95, 0.88) * 1.7;
  vec3 color = albedo * diffuse * sunColor * shadow;

  // The nebula glow fills the shadow side so it stays violet, never dead black.
  float upness = 0.5 + 0.5 * dot(N, normalize(vec3(0.25, 0.8, 0.3)));
  vec3 fill = mix(vec3(0.03, 0.012, 0.09), vec3(0.075, 0.026, 0.17), upness);
  color += albedo * fill * 1.05;

  // Ocean glitter: a tight core inside a broad sheen, reddening toward the horizon.
  if (spec > 0.01 && uGlint > 0.0) {
    vec3 H = normalize(L + V);
    float NdH = max(dot(Nbase, H), 0.0);
    float lit = smoothstep(-0.02, 0.2, geo) * shadow;
    float fres = pow(1.0 - NdV, 5.0);
    color += spec * lit * (vec3(1.0, 0.86, 0.66) * (pow(NdH, 620.0) * 5.0 + pow(NdH, 110.0) * 0.26) + uAtmosphere * fres * 0.7);
    color = mix(color, uAtmosphere * 0.05 * max(diffuse, 0.05), spec * 0.12);
  }

  if (uHasEmissive) {
    vec3 glow = texture2D(uEmissive, vUv).rgb;
    float night = uNightOnly ? smoothstep(0.1, -0.14, geo) : 1.0;
    float pulse = uNightOnly ? 1.0 : 0.82 + 0.3 * sin(uTime * 0.9 + vDir.y * 4.0);
    color += glow * night * pulse * (uNightOnly ? 1.5 : 2.3) * shadow;
  }

  // Limb haze that ties the surface to its atmosphere shell.
  float limb = pow(1.0 - NdV, 3.5);
  float dayLimb = smoothstep(-0.25, 0.45, geo);
  color += uAtmosphere * limb * dayLimb * 0.42;

  color += vec3(0.42, 0.3, 0.9) * uHover * (pow(1.0 - NdV, 2.2) * 0.8);

  gl_FragColor = vec4(color, 1.0);
}
