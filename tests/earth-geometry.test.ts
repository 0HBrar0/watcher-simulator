import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { directionOf, radiiFor, surfaceOf, viewFrom, worldDirectionOf, zoomFor } from '../src/earth/earthGeometry'

describe('places on the sphere', () => {
  it('puts the prime meridian on +x and north on +y', () => {
    expect(surfaceOf(new Vector3(1, 0, 0))).toEqual({ lat: 0, lon: expect.closeTo(0) })
    expect(surfaceOf(new Vector3(0, 1, 0)).lat).toBeCloseTo(90)
    expect(surfaceOf(new Vector3(0, 0, -1)).lon).toBeCloseTo(90)
  })

  it('finds its way back from any place', () => {
    const { lat, lon } = surfaceOf(directionOf(48.85, 2.35, new Vector3()))
    expect(lat).toBeCloseTo(48.85)
    expect(lon).toBeCloseTo(2.35)
  })
})

describe('viewFrom', () => {
  it('reads the place and heading through Earth\'s rotation', () => {
    const frame = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1)
    const place = worldDirectionOf(20, 40, frame)
    const north = new Vector3(0, 1, 0).applyQuaternion(frame)
    const view = viewFrom(place, north, 2, frame)
    expect(view.lat).toBeCloseTo(20)
    expect(view.lon).toBeCloseTo(40)
    expect(view.bearing).toBeCloseTo(0)
  })

  it('reports east at the top of the screen as bearing 90', () => {
    const frame = new Quaternion()
    const view = viewFrom(new Vector3(1, 0, 0), new Vector3(0, 0, -1), 2, frame)
    expect(view.bearing).toBeCloseTo(90)
  })
})

describe('matching the map to the camera', () => {
  it('converts between camera distance and zoom both ways', () => {
    const zoom = zoomFor(2, 35, 900, 38)
    expect(radiiFor(zoom, 35, 900, 38)).toBeCloseTo(2)
  })

  it('zooms in as the camera gets closer', () => {
    expect(zoomFor(1.2, 0, 900, 38)).toBeGreaterThan(zoomFor(2, 0, 900, 38))
  })
})
