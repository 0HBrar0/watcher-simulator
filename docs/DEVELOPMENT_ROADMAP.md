# Development roadmap

## Done (v0.1)

- Baked sky, volumetric nebula, stars, galaxies and dust.
- 15 worlds and a star, all defined in data.
- Original masked colossus with independent position, target and gaze.
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
- 2026-10-31: Remaster. Replaced the figure with an original colossus, spread the worlds about 1.9x,
  added an astrolabe halo, aerial haze, galaxy glow, softer fog and more room in the interface.
- 2026-10-31: Reworked camera input so it is precise and independent of frame rate. Added the zoom
  rail, fine control, keyboard shortcuts, speed settings, world stepping and shareable links.
- 2026-10-31: Added Leave a word, with its own small service, and the first automated tests.
- 2026-10-31: Gave him a voice, with subtitles timed from the audio and eyes that follow his speech.
  Plain clicks no longer cancel flights.
