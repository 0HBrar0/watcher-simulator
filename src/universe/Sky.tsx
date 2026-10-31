import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BackSide, BoxGeometry, CubeCamera, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh, PMREMGenerator,
  Scene, ShaderMaterial, Vector3, WebGLCubeRenderTarget,
} from 'three'
import { shaders } from '../rendering/shaders'
import { sunPosition } from '../planets/PlanetRegistry'

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

const bakeVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const displayFrag = /* glsl */ `
varying vec3 vDir;
uniform samplerCube uCube;
void main() {
  gl_FragColor = vec4(textureCube(uCube, vec3(-vDir.x, vDir.yz)).rgb, 1.0);
}`

/** The baked far sky, plus the same light as image-based lighting for the character. */
export function Sky({ size }: { size: number }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const [bake, setBake] = useState<WebGLCubeRenderTarget | null>(null)

  useEffect(() => {
    const target = new WebGLCubeRenderTarget(size, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
    const bakeScene = new Scene()
    const material = new ShaderMaterial({
      vertexShader: bakeVert,
      fragmentShader: shaders.skyFrag,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: { uSunDir: { value: new Vector3().copy(sunPosition).normalize() } },
    })
    const geometry = new BoxGeometry(10, 10, 10)
    bakeScene.add(new Mesh(geometry, material))
    const cubeCamera = new CubeCamera(0.1, 100, target)
    const previous = gl.autoClear
    gl.autoClear = true
    cubeCamera.update(gl, bakeScene)
    gl.autoClear = previous
    material.dispose()
    geometry.dispose()

    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromCubemap(target.texture)
    scene.environment = env.texture
    scene.environmentIntensity = 0.85
    pmrem.dispose()
    setBake(target)
    return () => {
      scene.environment = null
      env.dispose()
      target.dispose()
    }
  }, [gl, scene, size])

  const material = useMemo(
    () => new ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: displayFrag,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: { uCube: { value: bake?.texture ?? null } },
    }),
    [bake],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh visible={!!bake} renderOrder={-1000} frustumCulled={false} material={material}>
      <boxGeometry args={[10, 10, 10]} />
    </mesh>
  )
}

