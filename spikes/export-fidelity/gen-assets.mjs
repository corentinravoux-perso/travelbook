// Generates synthetic photo-like test images + stickers into out/in/. No personal photos.
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'out', 'in')
mkdirSync(dir, { recursive: true })

let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function photo(w, h, phase) {
  const buf = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h
      const base = 0.5 + 0.5 * Math.sin(6 * u + phase) * Math.cos(4 * v - phase)
      const detail = 0.5 + 0.5 * Math.sin(90 * u + 40 * v) * Math.sin(70 * v - 30 * u)
      const n = (rnd() - 0.5) * 40
      const i = (y * w + x) * 3
      buf[i] = Math.max(0, Math.min(255, 255 * (0.6 * base + 0.2 * detail) + 60 * u + n))
      buf[i + 1] = Math.max(0, Math.min(255, 255 * (0.5 * (1 - base) + 0.3 * detail) + 50 * v + n))
      buf[i + 2] = Math.max(0, Math.min(255, 255 * (0.4 * base * (1 - u) + 0.4 * detail) + 90 * (1 - v) + n))
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } })
}

await photo(2551, 1700, 0).jpeg({ quality: 92 }).toFile(join(dir, 'photo-frame.jpg'))
await photo(1800, 1800, 2).jpeg({ quality: 92 }).toFile(join(dir, 'photo-ellipse.jpg'))
await photo(1600, 1200, 4).jpeg({ quality: 92 }).toFile(join(dir, 'photo-opacity.jpg'))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
<polygon points="120,10 150,85 230,90 168,140 188,220 120,175 52,220 72,140 10,90 90,85" fill="#ffcc33" stroke="#cc3300" stroke-width="8"/>
<circle cx="120" cy="120" r="30" fill="#cc3300" fill-opacity=".6"/></svg>`
writeFileSync(join(dir, 'sticker.svg'), svg)
// PNG sticker with alpha: soft-edged heart-ish blob, 600x600
const png = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><radialGradient id="g"><stop offset="0" stop-color="#ff6699"/><stop offset="1" stop-color="#6633cc" stop-opacity=".35"/></radialGradient></defs><circle cx="300" cy="300" r="270" fill="url(#g)"/><circle cx="300" cy="300" r="120" fill="none" stroke="#fff" stroke-width="14" stroke-opacity=".8"/></svg>`
await sharp(Buffer.from(png)).png().toFile(join(dir, 'sticker.png'))
