export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'

export interface QualityProfile {
  label: string
  dpr: number
  sphereSegments: number
  skySize: number
  bakeWidth: number
  nebulaSteps: number
  nebulaScale: number
  stars: number
  dust: number
  galaxyPoints: number
  atmosphereSteps: number
  shadowMapSize: number
  bloomLevels: number
  surfaceDetail: boolean
  multisampling: number
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { label: 'Low', dpr: 1, sphereSegments: 64, skySize: 1024, bakeWidth: 1024, nebulaSteps: 10, nebulaScale: 0.33, stars: 6000, dust: 500, galaxyPoints: 9000, atmosphereSteps: 4, shadowMapSize: 0, bloomLevels: 5, surfaceDetail: false, multisampling: 0 },
  medium: { label: 'Medium', dpr: 1.25, sphereSegments: 96, skySize: 1536, bakeWidth: 1536, nebulaSteps: 16, nebulaScale: 0.4, stars: 11000, dust: 900, galaxyPoints: 16000, atmosphereSteps: 6, shadowMapSize: 1024, bloomLevels: 6, surfaceDetail: true, multisampling: 2 },
  high: { label: 'High', dpr: 1.5, sphereSegments: 128, skySize: 2048, bakeWidth: 2048, nebulaSteps: 24, nebulaScale: 0.5, stars: 18000, dust: 1400, galaxyPoints: 26000, atmosphereSteps: 8, shadowMapSize: 2048, bloomLevels: 7, surfaceDetail: true, multisampling: 4 },
  ultra: { label: 'Ultra', dpr: 2, sphereSegments: 192, skySize: 3072, bakeWidth: 4096, nebulaSteps: 36, nebulaScale: 0.6, stars: 30000, dust: 2200, galaxyPoints: 42000, atmosphereSteps: 12, shadowMapSize: 4096, bloomLevels: 8, surfaceDetail: true, multisampling: 8 },
}

const KEY = 'watcher.quality'

export function loadQuality(): QualityLevel {
  try {
    const q = localStorage.getItem(KEY)
    if (q && q in QUALITY) return q as QualityLevel
  } catch { /* storage may be blocked */ }
  return detectLevel()
}

/** A first guess from the GPU's name. The adaptive resolution in App.tsx handles the rest. */
function detectLevel(): QualityLevel {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low'
    if (/intel|uhd|iris|radeon\(tm\) graphics|vega \d/i.test(name)) return 'low'
  } catch { /* fall through */ }
  return 'high'
}

export function saveQuality(level: QualityLevel) {
  try { localStorage.setItem(KEY, level) } catch { /* storage may be blocked */ }
}
