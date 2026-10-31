# Development roadmap

## Done (v0.1)

- Baked sky, volumetric nebula, stars, galaxies and dust.
- 15 worlds and a star, all defined in data.
- Sculpted original Watcher with independent position, target and gaze.
- Observer, Watcher POV and Planetary perspectives, with interruptible flights.
- Atlas, information panel, Watcher locator, four quality levels, adaptive resolution.

## Next

1. Measure on the RTX 4050 and at Ultra in a browser using the discrete GPU; tune the level table.
2. Commission or sculpt a rigged GLB, then replace the baked character.
3. Compress the character (meshopt) and lazy-load 4K maps after first paint.
4. Skinned or vertex-shader robe motion.
5. Planet-to-planet eclipses, and more moons.
6. Touch controls.
7. Experimental: WebGPU, then a path-traced stills mode.

## Log

- 2026-10-31: First playable. Fixed a StrictMode lifecycle bug that left baked maps empty.
