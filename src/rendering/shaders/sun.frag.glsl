varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vWorld;
uniform float uTime;
uniform float uHover;

void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float NdV = max(dot(normalize(vNormalW), V), 0.0);
  vec3 p = vDir * 3.4;
  float t = uTime * 0.03;
  float n = fbm(p + vec3(fbm(p * 1.4 + t, 4), fbm(p * 1.4 - t, 4), t) * 1.6, 6);
  float gran = cells(vDir * 26.0 + t);
  float heat = n * 0.8 + (1.0 - gran) * 0.3;
  vec3 color = mix(vec3(5.0, 2.2, 0.6), vec3(12.0, 8.0, 3.6), smoothstep(0.32, 0.78, heat));
  color *= mix(0.62, 1.05, pow(NdV, 0.45));
  color += vec3(0.5, 0.36, 0.8) * uHover * 0.5;
  gl_FragColor = vec4(color, 1.0);
}
