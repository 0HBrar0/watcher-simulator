varying vec3 vWorld;
varying vec3 vLocal;
uniform sampler2D uMap;
uniform bool uHasMap;
uniform vec3 uTint;
uniform vec3 uSun;
uniform vec3 uCentre;
uniform vec3 uRingNormal;
uniform float uPlanetRadius;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
uniform float uHover;
uniform float uSeed;

void main() {
  float r = length(vLocal.xy);
  float u = (r - uInner) / (uOuter - uInner);
  if (u < 0.0 || u > 1.0) discard;

  vec3 colour;
  float alpha;
  if (uHasMap) {
    vec4 t = texture2D(uMap, vec2(u, 0.5));
    colour = t.rgb * uTint;
    alpha = pow(t.a, 0.62);
  } else {
    // Debris: rings made of broken rock, clumping along the arc.
    float a = atan(vLocal.y, vLocal.x);
    float bands = fbm(vec3(u * 15.0, uSeed, 0.0), 4);
    float clumps = fbm(vec3(cos(a) * 4.0, sin(a) * 4.0, u * 30.0 + uSeed), 4);
    alpha = smoothstep(0.32, 0.66, bands) * (0.42 + 0.58 * smoothstep(0.34, 0.6, clumps));
    alpha *= smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.92, u);
    colour = uTint * (0.72 + 0.56 * clumps);
  }

  vec3 L = normalize(uSun - uCentre);
  vec3 V = normalize(cameraPosition - vWorld);

  // Shadow of the planet: a soft cylinder behind it.
  vec3 toP = vWorld - uCentre;
  float along = dot(toP, L);
  float off = length(toP - L * along);
  float shade = along < 0.0 ? smoothstep(uPlanetRadius * 0.96, uPlanetRadius * 1.04, off) : 1.0;

  // Lit from the same face as the viewer reflects; otherwise light leaks through thin ring.
  float sameSide = sign(dot(L, uRingNormal)) * sign(dot(V, uRingNormal));
  float through = sameSide > 0.0 ? 1.0 : mix(1.0, 0.2, alpha);
  float forward = pow(max(dot(-V, L), 0.0), 5.0);

  vec3 color = colour * (1.36 * through + forward * 2.0) * shade + colour * vec3(0.04, 0.018, 0.1);
  color += vec3(0.4, 0.3, 0.9) * uHover * 0.12;
  float a = alpha * uOpacity;
  gl_FragColor = vec4(color * a, a);
}
