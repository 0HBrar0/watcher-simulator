import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { cameraCommands, readout } from '../camera/cameraInput'
import { trackers } from './ScreenTracker'

/**
 * A hairline drawn straight on the sky. It wakes when you zoom, shows where you are between
 * furthest and closest, and fades on its own shortly after. Resting the pointer on the right
 * edge of the screen also wakes it, and it can be dragged.
 */
export function ZoomRail() {
  const track = useRef<HTMLDivElement>(null)

  const scrub = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    cameraCommands.zoomTo(1 - Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    e.stopPropagation()
    cameraCommands.zoomStep(e.key === 'ArrowUp' ? 0.5 : -0.5)
  }

  return (
    <div
      className="rail"
      ref={(el) => { trackers.rail = el }}
      onPointerEnter={() => { readout.held = true }}
      onPointerLeave={() => { readout.held = false }}
    >
      <button aria-label="Zoom in" title="Zoom in (+)" onClick={() => cameraCommands.zoomStep(1)}>+</button>
      <div
        className="rail__track"
        ref={(el) => { track.current = el; trackers.railTrack = el }}
        role="slider"
        tabIndex={0}
        aria-label="Zoom"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e) }}
        onPointerMove={(e) => { if (e.buttons) scrub(e) }}
        onKeyDown={onKey}
      >
        <i className="rail__thumb" ref={(el) => { trackers.railThumb = el }}>
          <span ref={(el) => { trackers.railLabel = el }} />
        </i>
      </div>
      <button aria-label="Zoom out" title="Zoom out (-)" onClick={() => cameraCommands.zoomStep(-1)}>−</button>
    </div>
  )
}
