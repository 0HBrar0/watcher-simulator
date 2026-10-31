import { forwardRef, useMemo } from 'react'
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing'
import { Vector2 } from 'three'
import { useApp } from '../state/store'
import type { QualityProfile } from '../state/quality'

const gradeFrag = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Violet in the shadows, a little warmth in the lights, and a touch of filmic contrast.
  vec3 shadows = mix(vec3(0.012, 0.004, 0.03), vec3(0.0), smoothstep(0.0, 0.34, l));
  c = c + shadows;
  c = mix(c, c * vec3(1.03, 1.0, 0.95), smoothstep(0.5, 1.0, l));
  c = mix(vec3(l), c, 1.08);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.14);
  outputColor = vec4(c, inputColor.a);
}`

class GradeEffect extends Effect {
  constructor() { super('Grade', gradeFrag) }
}

const Grade = forwardRef<GradeEffect>(function Grade(_, ref) {
  const effect = useMemo(() => new GradeEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

const CHROMA = new Vector2(0.00034, 0.00034)
const CHROMA_POV = new Vector2(0.0009, 0.0009)

/**
 * Deliberately short: HDR bloom, ACES, a violet grade, vignette, a breath of grain.
 * SSAO and depth of field are left out: almost nothing in open space has contact shadows,
 * and DoF fought the sense of enormous clarity. The Watcher's occlusion is baked into his mesh.
 */
export function PostProcessing({ quality }: { quality: QualityProfile }) {
  const inPov = useApp((s) => s.mode === 'watcher' && !s.travelling)
  return (
    <EffectComposer multisampling={quality.multisampling} frameBufferType={1016}>
      <Bloom
        intensity={0.62}
        luminanceThreshold={1.3}
        luminanceSmoothing={0.3}
        mipmapBlur
        levels={quality.bloomLevels}
        radius={0.72}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Grade />
      <ChromaticAberration offset={inPov ? CHROMA_POV : CHROMA} radialModulation modulationOffset={0.35} />
      <Vignette offset={0.32} darkness={inPov ? 0.82 : 0.56} />
      <Noise premultiply opacity={0.032} blendFunction={BlendFunction.SOFT_LIGHT} />
    </EffectComposer>
  )
}
