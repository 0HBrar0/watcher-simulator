// Bakes a fictional world into an equirectangular map, sampled from 3D noise so nothing seams.
// Pass 0: albedo + height in alpha. Pass 1: emissive.
varying vec2 vUv;
uniform int uPass;
uniform float uSeed, uFreq, uWarp, uSea, uIce, uCracks, uCities, uStorms;
uniform vec3 uDeep, uShallow, uLow, uHigh, uPeak, uGlow;

void main() {
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (0.5 - vUv.y) * 3.14159265;
  // planet UVs run top-down on the mesh, matching three's SphereGeometry
  vec3 d = vec3(cos(lat) * sin(lon + 1.5708), sin(-lat), cos(lat) * cos(lon + 1.5708));
  vec3 p = d * uFreq * 1.5 + uSeed * 1.37;

  vec3 w = vec3(fbm(p + 1.7, 5), fbm(p + 8.3, 5), fbm(p + 15.1, 5)) - 0.5;
  vec3 q = p + w * uWarp * 1.6;
  float h = fbm(q, 8);
  h = smoothstep(0.26, 0.74, h);
  float mountains = ridged(q * 2.1 + 3.0, 7);
  float rough = fbm(q * 7.0 + 5.0, 6) - 0.5;
  float surface = h * 0.7 + mountains * 0.3 * smoothstep(0.34, 0.7, h) + rough * 0.13;

  // Impact basins at two scales: a bowl with a raised lip, thinned out by a mask.
  float crater = 0.0;
  if (uSea <= 0.0) {
    float mask = smoothstep(0.42, 0.6, fbm(p * 0.7 + 13.0, 3));
    for (int i = 0; i < 2; i++) {
      float k = i == 0 ? 2.6 : 6.4;
      float c = cells(d * uFreq * k + 7.0 + float(i) * 11.0) / 0.5;
      float bowl = 1.0 - smoothstep(0.0, 0.34, c);
      float lip = smoothstep(0.26, 0.36, c) * (1.0 - smoothstep(0.36, 0.56, c));
      crater += (lip * 0.11 - bowl * 0.16) * mask;
    }
    surface += crater;
  }

  float sea = uSea;
  vec3 col;
  float height = surface;
  if (sea > 0.0 && surface < sea) {
    col = mix(uDeep, uShallow, pow(surface / sea, 2.2));
    height = surface * 0.2;
  } else {
    float t = sea > 0.0 ? (surface - sea) / (1.0 - sea) : surface;
    col = t < 0.55 ? mix(uLow, uHigh, t / 0.55) : mix(uHigh, uPeak, (t - 0.55) / 0.45);
    if (sea <= 0.0) {
      col = mix(mix(uDeep, uShallow, smoothstep(0.0, 0.3, t)), col, smoothstep(0.1, 0.42, t));
      col *= 1.0 + crater * 1.6;
    }
    col *= 0.7 + 0.6 * fbm(q * 9.0, 5);
    height = 0.42 + height * 0.58;
  }

  if (uIce > 0.0) {
    float pole = abs(d.y) + (fbm(p * 2.0, 4) - 0.5) * 0.3;
    float cap = smoothstep(1.0 - uIce - 0.08, 1.0 - uIce + 0.06, pole);
    col = mix(col, vec3(0.86, 0.9, 0.98), cap);
  }

  if (uStorms > 0.0) {
    // Weather painted into the map: curled bands with fine edges.
    vec3 sw = p * 0.9 + w * 3.4 + vec3(0.0, d.y * 2.0, 0.0);
    float swirl = fbm(sw, 7) + (fbm(sw * 4.0, 4) - 0.5) * 0.18;
    float s = smoothstep(0.5, 0.64, swirl) * uStorms;
    col = mix(col, uPeak, s * 0.88);
    height = mix(height, 0.3, s);
  }

  float crack = pow(1.0 - abs(2.0 * fbm(q * 0.9 + 21.0, 6) - 1.0), 26.0);
  float crackFine = pow(1.0 - abs(2.0 * fbm(q * 2.3 + 2.0, 5) - 1.0), 18.0);
  float fissure = uCracks * clamp(crack + crackFine * 0.45, 0.0, 1.0) * smoothstep(0.08, 0.3, surface);

  float city = 0.0;
  if (uCities > 0.0) {
    float land = sea > 0.0 ? smoothstep(sea, sea + 0.05, surface) : 1.0;
    float region = smoothstep(0.5, 0.66, fbm(p * 1.2 + 31.0, 5));
    float blocks = pow(vnoise(d * 170.0), 3.0) * 1.4 + pow(vnoise(d * 430.0), 4.0) * 1.6;
    float arteries = pow(1.0 - abs(2.0 * vnoise(d * 42.0) - 1.0), 14.0) * 0.8;
    city = uCities * land * region * (blocks + arteries);
  }

  if (uPass == 0) {
    col = mix(col, col * 0.3, fissure);
    // Palettes are authored as display colours; the renderer works in linear light.
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), clamp(height, 0.0, 1.0));
  } else {
    vec3 e = uGlow * (fissure * (uCracks > 0.0 ? 1.0 : 0.0) + city);
    gl_FragColor = vec4(e, 1.0);
  }
}
