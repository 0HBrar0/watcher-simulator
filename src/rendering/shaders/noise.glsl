float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

const mat3 ROT3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

float fbm(vec3 p, int octaves) {
  float a = 0.5, v = 0.0, n = 0.0;
  for (int i = 0; i < octaves; i++) {
    v += a * vnoise(p);
    n += a;
    a *= 0.5;
    p = ROT3 * p * 2.03;
  }
  return v / n;
}

float ridged(vec3 p, int octaves) {
  float a = 0.5, v = 0.0, n = 0.0, prev = 1.0;
  for (int i = 0; i < octaves; i++) {
    float r = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    r *= r;
    v += a * r * prev;
    n += a;
    prev = r;
    a *= 0.5;
    p = ROT3 * p * 2.1;
  }
  return v / n;
}

// F1 cellular distance, for craters and storm cells.
float cells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(x, y, z);
    vec3 r = g + hash33(i + g) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
