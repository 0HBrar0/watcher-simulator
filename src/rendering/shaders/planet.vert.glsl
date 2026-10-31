varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vDir;
varying vec2 vUv;
uniform float uDisplace;
uniform float uSeed;

float lump(vec3 d) {
  return fbm(d * 1.5 + uSeed, 5) * 1.5 - 0.72 + 0.6 * smoothstep(0.1, 0.9, d.y) - 0.5 * smoothstep(0.35, 0.8, -d.y);
}

void main() {
  vUv = uv;
  vDir = normalize(position);
  vec3 p = position;
  if (uDisplace > 0.0) p *= 1.0 + uDisplace * lump(vDir);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
