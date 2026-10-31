// A camera-facing halo: long soft streamers radiating from the star.
varying vec2 vUv;
uniform float uTime;
uniform float uDiscRadius;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  vec2 c = vec2(cos(a), sin(a));
  float streamers = fbm(vec3(c * 2.6, uTime * 0.012), 5);
  float fine = fbm(vec3(c * 9.0, uTime * 0.02 + 4.0), 4);
  float rr = max(r - uDiscRadius, 0.0) / (1.0 - uDiscRadius);
  float falloff = pow(1.0 - rr, 5.0);
  float glow = 0.024 / (rr + 0.026) * (1.0 - r * r);
  float rays = falloff * pow(streamers, 2.4) * 8.0 * (0.5 + fine);
  vec3 inner = vec3(1.0, 0.72, 0.4), outer = vec3(0.86, 0.26, 0.5);
  vec3 color = mix(outer, inner, exp(-rr * 5.0)) * (rays + glow * 3.2);
  gl_FragColor = vec4(color, 1.0);
}
