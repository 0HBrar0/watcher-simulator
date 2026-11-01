import { useEffect, useRef } from 'react'
import { useApp } from '../state/store'
import { cameraCommands, earthCommands } from '../camera/cameraInput'
import { COVER_ZOOM, ENTER_RADII, LEAVE_RADII, earthFrame, radiiFor, worldDirectionOf, zoomFor } from './earthGeometry'
import type { EarthMap } from './earthMap'

const LOAD_LIMIT_MS = 30000 // past this the free services are not answering, even on a busy machine
const SETTLE_LIMIT_MS = 1400 // how long the first view may take to fill in before the fade
const FADE_MS = 900 // keep in step with .real-earth in app.css
const TILE_FAILURES = 12 // in a row, with nothing arriving in between
const MAP_FOV = 38

/** The real planet, in its own layer over the universe. The universe stays behind it for the limb. */
export function RealEarth() {
  const host = useRef<HTMLDivElement>(null)
  const focused = useApp((s) => s.focusId === 'earth' && s.loaded) // the map never competes with the loading screen
  const blocked = useApp((s) => s.earthBlocked)
  const phase = useApp((s) => s.earthPhase)

  useEffect(() => {
    if (!focused || blocked || !host.current) return
    const app = () => useApp.getState()
    let gone = false
    let map: EarthMap | null = null
    let failures = 0
    let settle = 0
    let settling = false // the opening glide starts right at the way out

    const giveUp = () => {
      if (app().earthBlocked) return
      leave(false)
      app().setEarth({ earthBlocked: true, earthReady: false })
      app().notify('The real Earth is out of reach just now')
    }
    const loadTimer = window.setTimeout(giveUp, LOAD_LIMIT_MS)

    function leave(returnToSpace: boolean) {
      if (app().earthPhase === 'off') return
      clearTimeout(settle)
      if (map && returnToSpace) {
        const { lat, lng } = map.getCenter()
        cameraCommands.placeOverEarth(worldDirectionOf(lat, lng, earthFrame), LEAVE_RADII)
      }
      map?.stop()
      app().setEarth({ earthPhase: 'off', universeResting: false })
    }

    const onZoom = () => {
      if (!map || app().earthPhase !== 'on') return
      const zoom = map.getZoom()
      const out = map.getContainer()
      out.dataset.zoom = zoom.toFixed(2)
      out.dataset.radii = radiiFor(zoom, map.getCenter().lat, out.clientHeight, MAP_FOV).toFixed(2)
      app().setEarth({ universeResting: zoom >= COVER_ZOOM })
      if (!settling && radiiFor(zoom, map.getCenter().lat, map.getContainer().clientHeight, MAP_FOV) > ENTER_RADII + 0.08) leave(true)
    }

    earthCommands.leave = () => leave(true)
    earthCommands.enter = (view) => {
      if (!map || app().earthPhase !== 'off') return
      app().setEarth({ earthPhase: 'entering' })
      const height = map.getContainer().clientHeight
      const zoom = zoomFor(view.radii, view.lat, height, MAP_FOV)
      map.jumpTo({ center: [view.lon, view.lat], zoom, bearing: view.bearing, pitch: 0 })
      const reveal = () => {
        clearTimeout(settle)
        map?.off('idle', reveal)
        if (!map || app().earthPhase !== 'entering') return
        app().setEarth({ earthPhase: 'on' })
        map.getCanvas().focus({ preventScroll: true })
        // Keep the motion going through the fade, so the handover reads as one continuous zoom.
        settling = true
        map.once('moveend', () => { settling = false })
        map.easeTo({ zoom: Math.max(zoom + 0.3, zoomFor(ENTER_RADII * 0.8, view.lat, height, MAP_FOV)), duration: 1700 })
      }
      map.once('idle', reveal)
      settle = window.setTimeout(reveal, SETTLE_LIMIT_MS)
    }

    const stop = useApp.subscribe((state, previous) => {
      // Anything that sends the camera elsewhere takes you out of the map first.
      if (state.earthPhase === 'off') return
      if (state.request !== previous.request || state.quality !== previous.quality) leave(false)
    })

    import('./earthMap')
      .then(({ createMap }) => {
        if (gone || !host.current) return
        map = createMap(host.current)
        if (import.meta.env.DEV) Object.assign(window, { __map: map })
        map.once('load', () => {
          if (gone) return
          clearTimeout(loadTimer)
          app().setEarth({ earthReady: true })
        })
        map.on('zoom', onZoom)
        map.on('data', (e) => {
          if ((e as { sourceId?: string; tile?: unknown }).sourceId === 'imagery' && (e as { tile?: unknown }).tile) failures = 0
        })
        map.on('error', (e) => {
          // Fast zooming cancels tiles it no longer needs, which is not an outage.
          if ((e.error as { name?: string } | undefined)?.name === 'AbortError') return
          if ((e as { sourceId?: string }).sourceId === 'imagery' && ++failures >= TILE_FAILURES) giveUp()
        })
      })
      .catch(giveUp)

    return () => {
      gone = true
      clearTimeout(loadTimer)
      clearTimeout(settle)
      stop()
      leave(false)
      earthCommands.enter = () => {}
      earthCommands.leave = () => {}
      app().setEarth({ earthReady: false })
      const closing = map
      // The fade is still running when the camera has already been sent elsewhere.
      window.setTimeout(() => closing?.remove(), FADE_MS + 100)
    }
  }, [focused, blocked])

  return <div ref={host} className={`real-earth ${phase === 'on' ? 'real-earth--on' : ''}`} data-phase={phase} />
}
