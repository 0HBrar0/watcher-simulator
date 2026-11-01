# Architecture

React renders the interface and declares the scene. Everything that changes per frame lives outside
React state: shader uniforms, `watcherState`, and `Target.position` are mutated in place.

## Data flow

- `planets/planetData.ts` is the source of truth for every body, nebula and galaxy.
- `planets/PlanetRegistry.ts` turns that into live `Target`s (position, radius, framing). Picking,
  the camera, the nebula's occluders and the interface all read from it.
- `state/store.ts` holds interface state. The interface sends camera *requests*; `CameraManager`
  is the only thing that moves the camera.

## The three independent systems

- **Selection** (`selectedId`) is what the information panel shows.
- **Camera focus** (`mode`, `focusId`) is where you are.
- **Observation** (`watcherState.targetId`) is what the Watcher looks at, changed only through
  `setObservationTarget` in `watcher/ObservationSystem.ts`.

## Camera

`camera/CameraManager.tsx` has one camera in one of three rigs: `orbit`, `travel`, `pov`. Free
observer and planetary perspective are both `orbit`, differing in pivot and limits. Flights are
cubic Beziers that bend around bodies (`cameraPath.ts`). A drag, a scroll or a movement key cancels them; a plain click does not. Arrival points
are computed relative to the sun, so you always arrive at the lit side of a world.

## Voice

`voice/lines.ts` holds what he says, with beats measured from the audio. `voice/voice.ts` is the
only player: one audio element, ranked lines (opening over reactions over musings), and a
BroadcastChannel so that two open tabs never speak at once. `voice/useVoiceDirector.ts` decides
when he speaks. `interface/Subtitles.tsx` follows `voiceTime()`, and the eyes follow `isVoiced()`.

## Leave a word

`interface/LeaveAWord.tsx` is the dialog and `interface/word.ts` the only call it makes. The dialog
keeps every keydown to itself, so typing never reaches the camera or the shortcuts. Its service is
`uplink-service/`, deployed on its own from that folder.

## Rendering, far to near

1. `Sky`: expensive noise baked once into a cube map, also used as the image-based light.
2. `Starfield`, `Galaxy`: real points at real depths, for parallax.
3. Planets: one `ShaderMaterial` for all of them. Fictional worlds are baked on the GPU into
   equirectangular maps at start-up, so at runtime they cost the same as photo textures.
4. `Nebula`: fog ray-marched at reduced resolution, sampling a tiling 3D noise texture. Rays stop at
   planets analytically; the Watcher stays clear through a depth-tested composite plane.
5. `PostProcessing`: HDR bloom, ACES, violet grade, vignette, grain.

Screen-space AO and depth of field were left out: open space has almost no contact shadow, and his
occlusion is already baked into vertex colours.

GPU resources from a bake are owned by the effect that created them, because StrictMode runs effects
twice in development. Creating them in `useMemo` and disposing in an effect leaves empty maps.

## The Watcher

`tools/bake-watcher.mjs` sculpts the character with signed distance fields, polygonises each part
with surface nets, bakes ambient occlusion and colour into vertices, and writes a standard GLB.

GLB contract: `Head` (required, pivot at the neck), `Eye_L`, `Eye_R` (optional, used for the POV
camera), `Halo_A`, `Halo_B`, `Halo_C` (optional, each spins about its local Z). Without eyes the POV
camera sits at the `Head` pivot, so a replacement should have them. Materials named `Mask`, `Cloth`,
`Gold`, `Eye` get upgraded in `WatcherModel.tsx`; others are kept. Vertex colours are gamma-encoded
by the bake and decoded in the shader, so a replacement using them should do the same.

Input never moves the camera directly. It moves a goal (yaw, pitch, distance, pivot, lens) and the
camera eases onto that goal over time, so a pixel of drag or a wheel notch means the same at any
frame rate. `camera/cameraInput.ts` is the bridge to the interface: `readout` goes out and
`cameraCommands` comes back, without React renders in the camera loop.

Everything that depends on his size (lights, shadows, drift, picking, camera clearance, fog plane)
derives from `WATCHER.scale`, so resizing him means changing that one number and his position.

## Adding a world

Add an entry to `BODIES`. A `textured` surface needs a map in `public/assets/planets`; a `procedural`
one needs only a palette and noise settings. Nothing else has to change. The nebula shader has room
for 24 occluders (`MAX_OCCLUDERS`), so raise that past 23 bodies.

## Path tracing and WebGPU

Neither is in this release. Content is data-driven and rendering sits behind `UniverseScene`, so
either could arrive as a separate renderer without touching data, camera or interface.
