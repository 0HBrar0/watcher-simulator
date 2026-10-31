varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
uniform sampler2D uClouds;
uniform vec3 uSun;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSun - vWorld);
  float c = texture2D(uClouds, vUv).r;
  float alpha = smoothstep(0.1, 0.72, c);
  float NdL = dot(N, L);
  float day = smoothstep(-0.12, 0.55, NdL);

  // Sunset tint along the terminator, where light has crossed the most air.
  float dusk = exp(-pow((NdL - 0.03) / 0.09, 2.0));
  vec3 lit = mix(vec3(1.0, 0.98, 0.96) * 1.5, vec3(1.0, 0.42, 0.2) * 0.95, dusk * 0.8);
  vec3 color = lit * day * (0.66 + 0.34 * c) + vec3(0.03, 0.016, 0.08);
  float edge = pow(max(dot(N, V), 0.0), 0.45);
  gl_FragColor = vec4(color * alpha * edge, alpha * edge * 0.94);
}
