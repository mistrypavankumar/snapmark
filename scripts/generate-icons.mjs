// Generates the app icon and menu bar (tray) template icons with no
// dependencies: shapes are rasterized with supersampling and written as PNG
// through node:zlib.
//
//   build/icon.png                1024×1024 app icon (electron-builder makes the .icns)
//   resources/trayTemplate.png    16×16 black glyph + alpha (macOS template image)
//   resources/trayTemplate@2x.png 32×32
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ------------------------------------------------------------------ PNG ---

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** RGBA Float32 (0..1, straight alpha) → PNG bytes. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < width * 4; x++) {
      raw[y * (width * 4 + 1) + 1 + x] = Math.round(Math.min(1, Math.max(0, rgba[y * width * 4 + x])) * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ------------------------------------------------------------- Shapes ---

const roundRect = (x, y, w, h, r) => (px, py) => {
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  return px >= x && px <= x + w && py >= y && py <= y + h && (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

const polygon = (pts) => (px, py) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const union = (...fs) => (x, y) => fs.some((f) => f(x, y))

/**
 * Paints layers onto a transparent canvas. Each layer is
 * { shape(x, y) → bool, color(x, y) → [r, g, b, a] } in a `design`-unit space.
 */
function render(size, design, layers, samples = 4) {
  const out = new Float32Array(size * size * 4)
  const scale = design / size
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale
          const y = (py + (sy + 0.5) / samples) * scale
          // Composite this sample's layers (source-over, premultiplied).
          let cr = 0
          let cg = 0
          let cb = 0
          let ca = 0
          for (const layer of layers) {
            if (!layer.shape(x, y)) continue
            const [lr, lg, lb, la] = layer.color(x, y)
            if (layer.erase) {
              cr *= 1 - la
              cg *= 1 - la
              cb *= 1 - la
              ca *= 1 - la
              continue
            }
            cr = lr * la + cr * (1 - la)
            cg = lg * la + cg * (1 - la)
            cb = lb * la + cb * (1 - la)
            ca = la + ca * (1 - la)
          }
          r += cr
          g += cg
          b += cb
          a += ca
        }
      }
      const n = samples * samples
      const i = (py * size + px) * 4
      a /= n
      out[i] = a ? r / n / a : 0
      out[i + 1] = a ? g / n / a : 0
      out[i + 2] = a ? b / n / a : 0
      out[i + 3] = a
    }
  }
  return out
}

const hex = (h, alpha = 1) => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha]
}
const solid = (h, alpha) => {
  const c = hex(h, alpha)
  return () => c
}
const vertical = (top, bottom, y0, y1) => {
  const a = hex(top)
  const b = hex(bottom)
  return (_x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))
    return a.map((v, i) => v + (b[i] - v) * t)
  }
}

function write(rel, png) {
  const path = resolve(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, png)
  console.log(`wrote ${rel} (${png.length} bytes)`)
}

// ------------------------------------------------------------ App icon ---
// 1024 canvas, 824 content square per the macOS icon grid.

const bubble = union(
  roundRect(250, 262, 524, 350, 84),
  polygon([
    [352, 590],
    [482, 590],
    [300, 790]
  ])
)
const shift = (f, dx, dy) => (x, y) => f(x - dx, y - dy)

const appIcon = render(1024, 1024, [
  // Soft drop shadow under the tile.
  { shape: roundRect(100, 112, 824, 824, 185), color: solid('#000000', 0.22) },
  { shape: roundRect(100, 100, 824, 824, 185), color: vertical('#ff6b57', '#c81e16', 100, 924) },
  // Subtle top sheen.
  { shape: roundRect(100, 100, 824, 412, 185), color: solid('#ffffff', 0.06) },
  { shape: shift(bubble, 0, 14), color: solid('#6d0d07', 0.28) },
  { shape: bubble, color: solid('#ffffff') },
  { shape: roundRect(334, 368, 356, 44, 22), color: solid('#e5372b') },
  { shape: roundRect(334, 460, 232, 44, 22), color: solid('#e5372b') }
])
write('build/icon.png', encodePng(1024, 1024, appIcon))

// ---------------------------------------------------------- Tray icons ---
// Template images: black + alpha only; macOS tints them for the menu bar.

const trayLayers = [
  {
    shape: union(
      roundRect(1.5, 2.5, 13, 8.5, 2.2),
      polygon([
        [4, 10.5],
        [7.5, 10.5],
        [3.2, 14.6]
      ])
    ),
    color: solid('#000000')
  },
  { shape: roundRect(4, 5, 8, 1.4, 0.7), color: solid('#000000'), erase: true },
  { shape: roundRect(4, 7.4, 5.2, 1.4, 0.7), color: solid('#000000'), erase: true }
]
write('resources/trayTemplate.png', encodePng(16, 16, render(16, 16, trayLayers, 8)))
write('resources/trayTemplate@2x.png', encodePng(32, 32, render(32, 16, trayLayers, 8)))
