// Resizes the raw Solar System Scope downloads (tools/raw-textures, CC BY 4.0) into web-sized planet maps.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const IN = 'tools/raw-textures/'
const OUT = 'public/assets/planets/'
mkdirSync(OUT, { recursive: true })

const jobs = [
  ['8k_earth_daymap.jpg', 'earth_day.webp', 4096, 84],
  ['8k_earth_nightmap.jpg', 'earth_night.webp', 4096, 80],
  ['8k_earth_clouds.jpg', 'earth_clouds.webp', 4096, 78],
  ['2k_earth_normal_map.tif', 'earth_normal.webp', 2048, 86],
  ['2k_earth_specular_map.tif', 'earth_specular.webp', 2048, 80],
  ['8k_moon.jpg', 'moon.webp', 4096, 80],
  ['8k_mars.jpg', 'mars.webp', 4096, 80],
  ['8k_jupiter.jpg', 'jupiter.webp', 4096, 86],
  ['8k_saturn.jpg', 'saturn.webp', 2048, 86],
  ['2k_uranus.jpg', 'uranus.webp', 1024, 86],
  ['2k_neptune.jpg', 'neptune.webp', 2048, 86],
  ['4k_venus_atmosphere.jpg', 'venus.webp', 2048, 82],
  ['8k_mercury.jpg', 'mercury.webp', 4096, 78],
]
for (const [src, dst, width, quality] of jobs) {
  const info = await sharp(IN + src, { limitInputPixels: false }).resize({ width }).webp({ quality }).toFile(OUT + dst)
  console.log(dst, info.width + 'x' + info.height, (info.size / 1024 | 0) + 'KB')
}
const ring = await sharp(IN + '8k_saturn_ring_alpha.png').metadata()
console.log('ring', ring.width, ring.height, ring.channels, ring.hasAlpha)
await sharp(IN + '8k_saturn_ring_alpha.png').toFile(OUT + 'saturn_ring.png')
