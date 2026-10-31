// The single source of truth for what exists in the universe. Adding a body means adding an
// entry here: rendering, picking, the atlas, and camera framing are all driven from this list.

export type Vec3 = [number, number, number]
export type Rgb = [number, number, number]

export type BodyCategory = 'Star' | 'Terrestrial' | 'Gas giant' | 'Ice giant' | 'Moon' | 'Fictional world' | 'Fictional outpost'

export interface TexturedSurface {
  kind: 'textured'
  map: string
  emissiveMap?: string
  cloudMap?: string
  specularMap?: string
  bump?: number
}

/** Baked once at start-up on the GPU, then shaded exactly like a textured planet. */
export interface ProceduralSurface {
  kind: 'procedural'
  seed: number
  deep: Rgb
  shallow: Rgb
  low: Rgb
  high: Rgb
  peak: Rgb
  glow?: Rgb
  frequency: number
  warp: number
  sea?: number
  ice?: number
  cracks?: number
  cities?: number
  storms?: number
  bump?: number
}

export interface AtmosphereSettings {
  height: number // shell thickness as a fraction of the radius
  scatter: Rgb // what the sky scatters
  density: number
  sunset?: Rgb
}

export interface RingSettings {
  inner: number // in planet radii
  outer: number
  tilt?: Vec3
  texture?: string
  tint: Rgb
  opacity: number
}

export interface BodyEffects {
  flow?: number // gas-band drift
  displace?: number // lumpy, non-spherical silhouette
  flat?: number // airless, retroreflective regolith
  glint?: number // ocean sun glitter
}

export interface BodyView {
  distance: number // in radii
  azimuth: number // degrees from the sun direction around the body
  elevation: number
}

export interface BodyData {
  id: string
  name: string
  description: string
  context?: string
  category: BodyCategory
  fictional?: boolean
  position: Vec3
  radius: number
  tilt: number // axial tilt in degrees
  spin: number // radians per second
  surface: TexturedSurface | ProceduralSurface
  atmosphere?: AtmosphereSettings
  rings?: RingSettings
  effects?: BodyEffects
  view?: BodyView
  orbit?: { around: string; radius: number; speed: number; phase: number; inclination: number }
}

const tex = (name: string) => `assets/planets/${name}`

export const SUN = {
  id: 'sun',
  name: 'Sol',
  description: 'The light every world here borrows. It burns gold against a violet sky.',
  category: 'Star' as BodyCategory,
  position: [-3400, 1050, -2500] as Vec3,
  radius: 240,
  view: { distance: 4.2, azimuth: 150, elevation: 8 } as BodyView,
}

export const BODIES: BodyData[] = [
  {
    id: 'earth', name: 'Earth',
    description: 'Blue, crowded, and endlessly interesting. Of all the worlds he could study, this is the one he keeps returning to.',
    context: 'Oceans, cloud decks and city light',
    category: 'Terrestrial', position: [0, 0, 0], radius: 78, tilt: 23.4, spin: 0.012,
    surface: { kind: 'textured', map: tex('earth_day.webp'), emissiveMap: tex('earth_night.webp'), cloudMap: tex('earth_clouds.webp'), specularMap: tex('earth_specular.webp'), bump: 0.9 },
    atmosphere: { height: 0.075, scatter: [0.22, 0.42, 1.0], density: 1.15, sunset: [1.0, 0.42, 0.28] },
    effects: { glint: 1 },
    view: { distance: 2.9, azimuth: 55, elevation: 12 },
  },
  {
    id: 'moon', name: 'The Moon',
    description: 'Grey, quiet, and ancient. An old observation post sits somewhere on its far side.',
    category: 'Moon', position: [176, 62, 150], radius: 21, tilt: 6.7, spin: 0.004,
    surface: { kind: 'textured', map: tex('moon.webp'), bump: 2.6 },
    effects: { flat: 1 },
    view: { distance: 3, azimuth: 50, elevation: 10 },
  },
  {
    id: 'mars', name: 'Mars',
    description: 'A rust-red desert under a thin, dusty sky, marked by the longest canyon in the system.',
    category: 'Terrestrial', position: [-470, -96, 520], radius: 40, tilt: 25.2, spin: 0.011,
    surface: { kind: 'textured', map: tex('mars.webp'), bump: 1.8 },
    atmosphere: { height: 0.05, scatter: [1.0, 0.56, 0.36], density: 0.34 },
    view: { distance: 3, azimuth: 60, elevation: 14 },
  },
  {
    id: 'venus', name: 'Venus',
    description: 'A world sealed under bright sulphur cloud, beautiful from here and lethal anywhere closer.',
    category: 'Terrestrial', position: [-1110, 220, -300], radius: 58, tilt: 177, spin: -0.003,
    surface: { kind: 'textured', map: tex('venus.webp') },
    atmosphere: { height: 0.07, scatter: [1.0, 0.8, 0.5], density: 0.95 },
    effects: { flow: 0.3 },
    view: { distance: 3, azimuth: 50, elevation: 8 },
  },
  {
    id: 'mercury', name: 'Mercury',
    description: 'A scorched, cratered stone, running closest to the fire.',
    category: 'Terrestrial', position: [-1950, 690, -1430], radius: 24, tilt: 0, spin: 0.002,
    surface: { kind: 'textured', map: tex('mercury.webp'), bump: 2.4 },
    effects: { flat: 1 },
    view: { distance: 3, azimuth: 60, elevation: 10 },
  },
  {
    id: 'jupiter', name: 'Jupiter',
    description: 'A planet of storm bands wider than worlds, with one red tempest older than memory.',
    category: 'Gas giant', position: [1150, 240, -1040], radius: 215, tilt: 3.1, spin: 0.017,
    surface: { kind: 'textured', map: tex('jupiter.webp') },
    atmosphere: { height: 0.035, scatter: [0.92, 0.68, 0.46], density: 0.6 },
    effects: { flow: 1 },
    view: { distance: 2.7, azimuth: 62, elevation: 10 },
  },
  {
    id: 'io', name: 'Io',
    description: 'A restless moon of Jupiter, stained with sulphur and alive with volcanoes.',
    category: 'Moon', position: [1150, 240, -1040], radius: 13, tilt: 0, spin: 0.01,
    surface: { kind: 'procedural', seed: 14, deep: [0.3, 0.14, 0.05], shallow: [0.5, 0.3, 0.1], low: [0.72, 0.56, 0.16], high: [0.9, 0.8, 0.36], peak: [0.95, 0.92, 0.72], glow: [1, 0.3, 0.06], frequency: 3.4, warp: 0.5, cracks: 0.22, bump: 1 },
    orbit: { around: 'jupiter', radius: 320, speed: 0.024, phase: 2.2, inclination: 0.12 },
    view: { distance: 3.4, azimuth: 55, elevation: 10 },
  },
  {
    id: 'saturn', name: 'Saturn',
    description: 'Pale gold under a blade of ice. The rings are thousands of kilometres wide and barely deeper than a house.',
    category: 'Gas giant', position: [1000, -240, -120], radius: 168, tilt: 26.7, spin: 0.016,
    surface: { kind: 'textured', map: tex('saturn.webp') },
    atmosphere: { height: 0.03, scatter: [0.98, 0.84, 0.6], density: 0.45 },
    rings: { inner: 1.24, outer: 2.34, texture: tex('saturn_ring.png'), tint: [1, 0.93, 0.84], opacity: 1 },
    effects: { flow: 0.8 },
    view: { distance: 3.6, azimuth: 66, elevation: 18 },
  },
  {
    id: 'uranus', name: 'Uranus',
    description: 'A pale cyan giant knocked onto its side, rolling around the sun.',
    category: 'Ice giant', position: [150, 650, 1820], radius: 92, tilt: 97.8, spin: 0.01,
    surface: { kind: 'textured', map: tex('uranus.webp') },
    atmosphere: { height: 0.05, scatter: [0.5, 0.92, 1.0], density: 0.9 },
    rings: { inner: 1.6, outer: 1.68, tint: [0.62, 0.8, 0.95], opacity: 0.4 },
    view: { distance: 3.2, azimuth: 55, elevation: 12 },
  },
  {
    id: 'neptune', name: 'Neptune',
    description: 'The last blue light before the dark. Its winds are the fastest in the system.',
    category: 'Ice giant', position: [-1620, -560, 1500], radius: 88, tilt: 28.3, spin: 0.012,
    surface: { kind: 'textured', map: tex('neptune.webp') },
    atmosphere: { height: 0.055, scatter: [0.2, 0.42, 1.0], density: 1.05 },
    effects: { flow: 0.5 },
    view: { distance: 3.2, azimuth: 56, elevation: 10 },
  },

  // Beyond the map: original interpretations, rendered from procedural surfaces.
  {
    id: 'xandar', name: 'Xandar', fictional: true,
    description: 'A garden capital of glass cities, ringed by shallow gold-lit seas.',
    category: 'Fictional world', position: [-1500, 500, -100], radius: 82, tilt: 14, spin: 0.01,
    surface: { kind: 'procedural', seed: 3, deep: [0.01, 0.06, 0.26], shallow: [0.05, 0.42, 0.62], low: [0.14, 0.42, 0.26], high: [0.72, 0.62, 0.34], peak: [0.95, 0.92, 0.86], glow: [1, 0.74, 0.32], frequency: 2.5, warp: 0.9, sea: 0.52, ice: 0.1, cities: 1, storms: 0.8, bump: 1 },
    atmosphere: { height: 0.08, scatter: [0.3, 0.62, 1.0], density: 1.1, sunset: [1, 0.6, 0.3] },
    effects: { glint: 1 },
    view: { distance: 3, azimuth: 52, elevation: 12 },
  },
  {
    id: 'titan', name: 'Titan', fictional: true,
    description: 'A ruined world of orange dust, where broken arcs of its own crust still hang in the sky.',
    category: 'Fictional world', position: [1720, -130, 880], radius: 56, tilt: 18, spin: 0.006,
    surface: { kind: 'procedural', seed: 21, deep: [0.1, 0.03, 0.02], shallow: [0.24, 0.07, 0.03], low: [0.5, 0.17, 0.06], high: [0.78, 0.4, 0.14], peak: [0.9, 0.7, 0.42], glow: [1, 0.3, 0.1], frequency: 3.2, warp: 1.2, cracks: 0.34, bump: 2.2 },
    atmosphere: { height: 0.05, scatter: [1.0, 0.5, 0.26], density: 0.55 },
    rings: { inner: 1.45, outer: 2.05, tilt: [0.4, 0, 0.3], tint: [0.8, 0.46, 0.28], opacity: 0.62 },
    view: { distance: 3.2, azimuth: 58, elevation: 14 },
  },
  {
    id: 'vormir', name: 'Vormir', fictional: true,
    description: 'Black seas and bruise-violet weather. Nothing here welcomes a visitor.',
    category: 'Fictional world', position: [-1720, -210, -210], radius: 50, tilt: 31, spin: 0.005,
    surface: { kind: 'procedural', seed: 37, deep: [0.008, 0.016, 0.04], shallow: [0.02, 0.1, 0.14], low: [0.05, 0.05, 0.1], high: [0.2, 0.15, 0.34], peak: [0.76, 0.72, 0.9], glow: [0.5, 0.3, 1], frequency: 4.1, warp: 1.5, sea: 0.56, storms: 0.8, ice: 0.3, bump: 1.6 },
    atmosphere: { height: 0.09, scatter: [0.52, 0.28, 1.0], density: 1.4 },
    view: { distance: 3, azimuth: 60, elevation: 10 },
  },
  {
    id: 'ego', name: 'Ego', fictional: true,
    description: 'Too symmetrical, too alive. Light pulses along its fissures like a heartbeat.',
    category: 'Fictional world', position: [660, 780, 610], radius: 74, tilt: 9, spin: 0.008,
    surface: { kind: 'procedural', seed: 52, deep: [0.04, 0.02, 0.12], shallow: [0.08, 0.26, 0.42], low: [0.1, 0.4, 0.42], high: [0.62, 0.24, 0.62], peak: [0.96, 0.82, 0.98], glow: [0.28, 0.9, 1], frequency: 2.1, warp: 1.8, sea: 0.3, cracks: 0.75, bump: 1.3 },
    atmosphere: { height: 0.07, scatter: [0.5, 0.5, 1.0], density: 0.8 },
    view: { distance: 3, azimuth: 55, elevation: 12 },
  },
  {
    id: 'sakaar', name: 'Sakaar', fictional: true,
    description: 'A junk-strewn desert world beneath a sky of open portals. Everything lost ends up here.',
    category: 'Fictional world', position: [-290, -620, -860], radius: 64, tilt: 21, spin: 0.009,
    surface: { kind: 'procedural', seed: 68, deep: [0.16, 0.05, 0.08], shallow: [0.3, 0.1, 0.12], low: [0.56, 0.26, 0.14], high: [0.72, 0.5, 0.3], peak: [0.42, 0.5, 0.64], glow: [1, 0.32, 0.56], frequency: 4.8, warp: 1.0, cracks: 0.12, cities: 0.3, bump: 2 },
    atmosphere: { height: 0.06, scatter: [1.0, 0.44, 0.66], density: 0.8 },
    rings: { inner: 1.5, outer: 1.86, tilt: [0.9, 0, -0.2], tint: [0.9, 0.38, 0.62], opacity: 0.44 },
    view: { distance: 3, azimuth: 56, elevation: 14 },
  },
  {
    id: 'knowhere', name: 'Knowhere', fictional: true,
    description: 'A lawless mining outpost carved out of something colossal that should not exist.',
    category: 'Fictional outpost', position: [980, -210, 2050], radius: 44, tilt: 62, spin: 0.003,
    surface: { kind: 'procedural', seed: 83, deep: [0.02, 0.016, 0.03], shallow: [0.05, 0.04, 0.07], low: [0.11, 0.09, 0.13], high: [0.26, 0.22, 0.28], peak: [0.5, 0.46, 0.5], glow: [1, 0.66, 0.26], frequency: 5, warp: 1.1, cities: 0.3, cracks: 0.1, bump: 3 },
    effects: { displace: 0.32 },
    view: { distance: 3.4, azimuth: 56, elevation: 16 },
  },
]

export interface NebulaVolume {
  position: Vec3
  radius: number
  inner: Rgb
  outer: Rgb
  density: number
  scale: number
}

// Fog you can fly through. The sky behind them is baked; these provide real parallax.
export const NEBULAE: NebulaVolume[] = [
  { position: [-1300, 240, -1500], radius: 1500, inner: [1.0, 0.34, 0.78], outer: [0.3, 0.12, 0.92], density: 1, scale: 1.8 },
  { position: [1600, 300, 1500], radius: 1500, inner: [0.34, 0.5, 1.0], outer: [0.34, 0.1, 0.82], density: 0.82, scale: 1.6 },
  { position: [-1500, -480, 1600], radius: 1100, inner: [0.4, 0.86, 0.95], outer: [0.2, 0.2, 0.76], density: 0.7, scale: 2.1 },
  { position: [1200, -700, -1500], radius: 1200, inner: [1.0, 0.56, 0.42], outer: [0.62, 0.12, 0.6], density: 0.68, scale: 1.9 },
]

export interface GalaxyData {
  position: Vec3
  radius: number
  normal: Vec3
  arms: number
  twist: number
  core: Rgb
  arm: Rgb
  share: number // fraction of the quality budget's points
}

export const GALAXIES: GalaxyData[] = [
  { position: [3000, 2300, -6200], radius: 1050, normal: [0.2, 0.36, -0.91], arms: 2, twist: 3.4, core: [1.0, 0.82, 0.6], arm: [0.5, 0.42, 1.0], share: 0.5 },
  { position: [-6400, -1900, 3600], radius: 1100, normal: [-0.7, -0.5, 0.5], arms: 3, twist: 2.6, core: [1.0, 0.7, 0.9], arm: [0.86, 0.3, 0.9], share: 0.3 },
  { position: [2600, -3000, 6400], radius: 800, normal: [0.3, -0.7, 0.64], arms: 2, twist: 4.2, core: [0.84, 0.9, 1.0], arm: [0.3, 0.72, 1.0], share: 0.2 },
]

export const WATCHER = {
  id: 'watcher',
  name: 'The Watcher',
  description: 'He has stood at the edge of events since before they began. He observes. He does not interfere. At least, that is the oath.',
  position: [214, 118, 182] as Vec3,
  scale: 13,
  modelUrl: 'assets/characters/watcher.glb',
  initialTarget: 'xandar',
  view: { distance: 7.4, azimuth: 38, elevation: 6 } as BodyView,
}

export const UNIVERSE = {
  boundary: 3400, // the free camera is gently kept inside this radius
  overview: { position: [-300, 96, 470] as Vec3, pivot: [180, 80, -40] as Vec3 },
  introStart: { position: [-1040, 420, 1560] as Vec3, pivot: [-300, 180, 420] as Vec3 },
}
