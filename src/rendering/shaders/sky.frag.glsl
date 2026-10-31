// Baked once into a cube map: the farthest layers of the universe. It runs expensive noise so
// that the per-frame sky is a single texture read.
varying vec3 vDir;
uniform vec3 uSunDir;

vec3 ramp(float t, vec3 a, vec3 b, vec3 c) {
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
}

float lobe(vec3 d, vec3 c, float width) {
  return exp((dot(d, normalize(c)) - 1.0) / (width * width));
}

float tinyStars(vec3 d, float scale, float threshold) {
  vec3 p = d * scale;
  vec3 i = floor(p), f = fract(p) - 0.5;
  float h = hash13(i);
  if (h < threshold) return 0.0;
  vec3 o = (hash33(i + 7.0) - 0.5) * 0.6;
  float r = length(f - o);
  return smoothstep(0.34, 0.04, r) * pow((h - threshold) / (1.0 - threshold), 2.0);
}

void main() {
  vec3 d = normalize(vDir);

  // The base is never black: indigo depth with a tilted galactic band running through it.
  vec3 bandAxis = normalize(vec3(0.24, 0.92, 0.3));
  float lat = dot(d, bandAxis);
  float band = exp(-lat * lat * 7.0);
  vec3 base = mix(vec3(0.0052, 0.0034, 0.022), vec3(0.018, 0.009, 0.062), band);
  base += vec3(0.02, 0.006, 0.038) * pow(max(dot(d, normalize(vec3(-0.7, 0.2, -0.5))), 0.0), 3.0);

  // Domain-warped clouds.
  vec3 q = d * 2.1 + 3.7;
  vec3 warp = vec3(fbm(q + 11.3, 5), fbm(q + 4.1, 5), fbm(q + 23.9, 5)) - 0.5;
  vec3 w = q + warp * 2.6;
  float cloud = fbm(w, 8);
  float fine = ridged(w * 1.8 + warp, 6);
  float cloud2 = fbm(w * 0.62 + 9.0, 6);

  // Art-directed regions rather than uniform noise.
  float magenta = lobe(d, vec3(-0.72, 0.22, -0.6), 0.72) + 0.36 * band;
  float blue = lobe(d, vec3(0.8, 0.2, 0.55), 0.62);
  float teal = lobe(d, vec3(-0.5, -0.35, 0.78), 0.46);
  float rose = lobe(d, vec3(0.42, -0.44, -0.78), 0.44);
  float gold = lobe(d, uSunDir, 0.32);

  float body = smoothstep(0.42, 0.76, cloud);
  float wisps = pow(fine, 2.6) * smoothstep(0.34, 0.66, cloud);
  vec3 col = base;

  vec3 purple = ramp(cloud2, vec3(0.08, 0.02, 0.24), vec3(0.42, 0.08, 0.72), vec3(1.0, 0.3, 0.74));
  col += purple * (body * 0.58 + wisps * 1.0) * magenta;
  vec3 azure = ramp(cloud2, vec3(0.02, 0.05, 0.3), vec3(0.14, 0.26, 0.98), vec3(0.54, 0.46, 1.0));
  col += azure * (body * 0.56 + wisps * 1.0) * blue;
  vec3 cyan = ramp(cloud2, vec3(0.0, 0.08, 0.2), vec3(0.08, 0.5, 0.66), vec3(0.6, 0.92, 0.94));
  col += cyan * (body * 0.48 + wisps * 0.9) * teal;
  vec3 ember = ramp(cloud2, vec3(0.2, 0.02, 0.2), vec3(0.86, 0.2, 0.34), vec3(1.0, 0.64, 0.34));
  col += ember * (body * 0.5 + wisps * 0.9) * rose;
  col += vec3(1.0, 0.62, 0.3) * (body * 0.34 + wisps * 0.46) * gold;

  // A faint violet floor everywhere, so space has colour even between the set pieces.
  col += vec3(0.05, 0.016, 0.12) * smoothstep(0.34, 0.8, cloud2) * (0.4 + band);

  // Dust lanes eat light, including the stars behind them.
  float lanes = smoothstep(0.5, 0.76, fbm(w * 1.5 + 41.0, 7)) * (0.38 + 0.62 * band);
  col *= 1.0 - 0.8 * lanes;

  // Unresolved stars: thick in the galactic band, sparse above it.
  float density = mix(0.965, 0.9, band);
  float stars = tinyStars(d, 150.0, density) + 0.7 * tinyStars(d, 320.0, density) + 0.42 * tinyStars(d + 2.0, 640.0, 0.86 + 0.08 * (1.0 - band));
  vec3 starTint = mix(vec3(1.0, 0.86, 0.72), vec3(0.72, 0.8, 1.0), hash13(floor(d * 90.0)));
  col += stars * starTint * (1.0 - lanes) * 1.1;

  // Milky haze from stars too far to see.
  col += vec3(0.1, 0.05, 0.2) * band * band * (0.3 + 0.7 * fine);

  gl_FragColor = vec4(col, 1.0);
}
