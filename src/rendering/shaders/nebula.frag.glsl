// Ray-marched fog volumes, rendered at reduced resolution and composited over the scene.
// Planets stop the ray analytically, so no depth buffer is needed at this resolution.
varying vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCam;
uniform vec3 uSun;
uniform float uTime;
uniform sampler3D uNoise;
uniform int uSteps;

#define MAX_VOLUMES 6
#define MAX_OCCLUDERS 24
uniform int uVolumeCount;
uniform vec4 uVolumes[MAX_VOLUMES]; // xyz centre, w radius
uniform vec4 uInner[MAX_VOLUMES];   // rgb, a density
uniform vec4 uOuter[MAX_VOLUMES];   // rgb, a noise scale
uniform int uOccluderCount;
uniform vec4 uOccluders[MAX_OCCLUDERS];

vec2 sphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float density(vec3 q, float scale, out float detail) {
  float r = length(q);
  vec3 p = q * scale + vec3(0.0, uTime * 0.0016, uTime * 0.0011);
  vec2 warp = texture(uNoise, p * 0.33).rg - 0.5;
  vec3 s = p * 0.62 + vec3(warp, warp.x * warp.y) * 0.42;
  vec2 n = texture(uNoise, s).rg;
  float t = texture(uNoise, s * 2.7).r;
  detail = t;
  float d = n.r * 0.68 + t * 0.32;
  float edge = 1.0 - smoothstep(0.32, 1.0, r);
  return clamp((d - 0.6 + edge * 0.2) * edge * 5.0, 0.0, 1.0);
}

void main() {
  vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(far.xyz / far.w - uCam);

  float tMax = 1e9;
  for (int i = 0; i < uOccluderCount; i++) {
    vec2 h = sphere(uCam, rd, uOccluders[i].xyz, uOccluders[i].w);
    if (h.x < h.y && h.y > 0.0) tMax = min(tMax, max(h.x, 0.0));
  }

  float jitter = ign(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  float transmit = 1.0;

  // The app keeps volumes sorted front to back.
  for (int v = 0; v < uVolumeCount; v++) {
    vec3 c = uVolumes[v].xyz;
    float R = uVolumes[v].w;
    vec2 h = sphere(uCam, rd, c, R);
    float t0 = max(h.x, 0.0), t1 = min(h.y, tMax);
    if (t1 <= t0) continue;
    float dt = (t1 - t0) / float(uSteps);
    float stepWeight = dt / R;
    vec3 toSun = normalize(uSun - c);
    float t = t0 + dt * jitter;
    for (int i = 0; i < uSteps; i++) {
      vec3 q = (uCam + rd * t - c) / R;
      float detail;
      float d = density(q, uOuter[v].a, detail) * uInner[v].a;
      if (d > 0.002) {
        float unused;
        float lit = density(q + toSun * 0.09, uOuter[v].a, unused);
        float shade = exp(-lit * 2.6);
        float core = smoothstep(0.75, 0.0, length(q));
        vec3 col = mix(uOuter[v].rgb, uInner[v].rgb, smoothstep(0.42, 0.72, detail) * (0.3 + 0.7 * core));
        vec3 emission = col * (0.12 + 0.96 * shade) * (0.5 + 1.0 * core);
        float a = 1.0 - exp(-d * stepWeight * 2.6);
        sum += transmit * emission * a * 0.34;
        transmit *= 1.0 - a * 0.5;
        if (transmit < 0.03) break;
      }
      t += dt;
    }
    if (transmit < 0.03) break;
  }

  gl_FragColor = vec4(sum, 1.0 - transmit);
}
