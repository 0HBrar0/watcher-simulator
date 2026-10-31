import noise from './noise.glsl?raw'
import skyFrag from './sky.frag.glsl?raw'
import nebulaFrag from './nebula.frag.glsl?raw'
import planetVert from './planet.vert.glsl?raw'
import planetFrag from './planet.frag.glsl?raw'
import cloudsFrag from './clouds.frag.glsl?raw'
import atmosphereFrag from './atmosphere.frag.glsl?raw'
import ringFrag from './ring.frag.glsl?raw'
import proceduralFrag from './proceduralPlanet.frag.glsl?raw'
import sunFrag from './sun.frag.glsl?raw'
import coronaFrag from './corona.frag.glsl?raw'

export const shaders = {
  skyFrag: noise + skyFrag,
  nebulaFrag,
  planetVert: noise + planetVert,
  planetFrag: noise + planetFrag,
  cloudsFrag,
  atmosphereFrag,
  ringFrag: noise + ringFrag,
  proceduralFrag: noise + proceduralFrag,
  sunFrag: noise + sunFrag,
  coronaFrag: noise + coronaFrag,
}

export const sphereVert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vDir;
varying vec2 vUv;
void main() {
  vUv = uv;
  vDir = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`

export const ringVert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

/** Fills the viewport regardless of camera. */
export const screenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`
