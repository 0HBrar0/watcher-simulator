import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

const IMAGERY_YEAR = 2025
const IMAGERY = `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${IMAGERY_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`

const INK = '#f2ecff'
const GOLD = '#f2c879'
const HALO = 'rgba(14, 6, 40, 0.86)'
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]

const places = (classes: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', classes]]

/** Sentinel-2 by day, names by zoom, and drawn streets for where the imagery runs out of detail. */
export const earthStyle: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'atmosphere-blend': 0 },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    imagery: {
      type: 'raster',
      tiles: [IMAGERY],
      tileSize: 256,
      maxzoom: 14,
      attribution: `<a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer">Sentinel-2 cloudless by EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data ${IMAGERY_YEAR})`,
    },
    map: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 240, 'raster-brightness-min': 0.1, 'raster-saturation': 0.2 } },
    // The photographs run out at about 10 m a pixel, so the night sky's colour slowly takes over.
    {
      id: 'veil',
      type: 'background',
      paint: { 'background-color': '#160b36', 'background-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 16, 0.66] },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: 'map',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': 'rgba(233, 224, 255, 0.16)',
        'fill-outline-color': 'rgba(233, 224, 255, 0.34)',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1],
      },
    },
    {
      id: 'streets',
      type: 'line',
      source: 'map',
      'source-layer': 'transportation',
      minzoom: 12.5,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': INK,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 14.5, 0.5],
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.4, 18, 7],
      },
    },
    {
      id: 'highways',
      type: 'line',
      source: 'map',
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': GOLD,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 11, 0.5],
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 0.5, 18, 9],
      },
    },
    {
      id: 'state-lines',
      type: 'line',
      source: 'map',
      'source-layer': 'boundary',
      minzoom: 3.5,
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': INK, 'line-opacity': 0.26, 'line-width': 0.7, 'line-dasharray': [2, 2] },
    },
    {
      id: 'country-lines',
      type: 'line',
      source: 'map',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': INK, 'line-opacity': 0.5, 'line-width': 0.9 },
    },
    {
      id: 'street-names',
      type: 'symbol',
      source: 'map',
      'source-layer': 'transportation_name',
      minzoom: 14.5,
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
    {
      id: 'small-places',
      type: 'symbol',
      source: 'map',
      'source-layer': 'place',
      minzoom: 9,
      filter: places(['town', 'village', 'suburb', 'neighbourhood', 'quarter']),
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 15, 14],
      },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
    {
      id: 'cities',
      type: 'symbol',
      source: 'map',
      'source-layer': 'place',
      minzoom: 4.5,
      filter: places(['city']),
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 12, 12, 22],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 1.4 },
    },
    {
      id: 'states',
      type: 'symbol',
      source: 'map',
      'source-layer': 'place',
      minzoom: 3.8,
      maxzoom: 8.5,
      filter: places(['state', 'province']),
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 16],
        'text-letter-spacing': 0.06,
      },
      paint: { 'text-color': 'rgba(233, 224, 255, 0.82)', 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
    {
      id: 'countries',
      type: 'symbol',
      source: 'map',
      'source-layer': 'place',
      maxzoom: 7,
      filter: places(['country']),
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 14, 6, 24],
        'text-letter-spacing': 0.04,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: { 'text-color': GOLD, 'text-halo-color': HALO, 'text-halo-width': 1.4 },
    },
  ],
}
