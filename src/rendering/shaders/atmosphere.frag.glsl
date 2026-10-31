// Single scattering through the shell around a planet, marched per pixel.
varying vec3 vWorld;
uniform vec3 uCentre;
uniform vec3 uSun;
uniform vec3 uScatter;
uniform vec3 uSunset;
uniform float uPlanetRadius;
uniform float uShellRadius;
uniform float uDensity;
uniform int uSteps;

vec2 hit(vec3 ro, vec3 rd, float r) {
  vec3 oc = ro - uCentre;
  float b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec2 shell = hit(ro, rd, uShellRadius);
  float t0 = max(shell.x, 0.0), t1 = shell.y;
  if (t1 <= t0) discard;
  vec2 ground = hit(ro, rd, uPlanetRadius);
  if (ground.x > 0.0 && ground.x < ground.y) t1 = min(t1, ground.x);

  float H = (uShellRadius - uPlanetRadius);
  float scaleH = H * 0.3;
  float ds = (t1 - t0) / float(uSteps);
  vec3 L = normalize(uSun - uCentre);
  float mu = dot(rd, L);
  float rayleigh = 0.75 * (1.0 + mu * mu);
  float g = 0.76, mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;

  vec3 sum = vec3(0.0);
  float depth = 0.0;
  float t = t0 + ds * 0.5;
  for (int i = 0; i < uSteps; i++) {
    vec3 p = ro + rd * t - uCentre;
    float r = length(p);
    float h = max(r - uPlanetRadius, 0.0);
    float rho = exp(-h / scaleH);
    depth += rho * ds;
    float cosSun = dot(p / r, L);
    // Light reaches this sample only around the day side, reddening as it grazes the limb.
    float lit = smoothstep(-0.2, 0.14, cosSun);
    float graze = exp(-pow(max(cosSun, 0.0) / 0.3, 2.0));
    vec3 tint = mix(uScatter, uSunset, graze * 0.45);
    float viewFade = exp(-depth / (scaleH * 26.0) * uDensity);
    sum += rho * ds * lit * tint * viewFade * (rayleigh + mie);
    t += ds;
  }
  vec3 color = sum * uDensity * (0.17 / scaleH);
  gl_FragColor = vec4(color, 1.0);
}
