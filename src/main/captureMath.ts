import type { SelectionRect } from '@shared/ipc'

export interface Size {
  width: number
  height: number
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Converts a selection made in display DIPs into a crop rectangle in the
 * captured frame's physical pixels. The ratio is derived from the actual
 * frame size rather than `scaleFactor`, so it stays exact for scaled
 * ("More Space") Retina modes and mixed-DPI multi-monitor setups.
 *
 * Edges are rounded outward so the crop never loses a partially selected
 * pixel, then clamped to the frame. Returns null for an empty selection.
 */
export function selectionToPixels(
  sel: SelectionRect,
  display: Size,
  frame: Size
): PixelRect | null {
  if (display.width <= 0 || display.height <= 0) return null
  const sx = frame.width / display.width
  const sy = frame.height / display.height
  const x1 = clampInt(Math.floor(Math.min(sel.x, sel.x + sel.width) * sx), 0, frame.width)
  const y1 = clampInt(Math.floor(Math.min(sel.y, sel.y + sel.height) * sy), 0, frame.height)
  const x2 = clampInt(Math.ceil(Math.max(sel.x, sel.x + sel.width) * sx), 0, frame.width)
  const y2 = clampInt(Math.ceil(Math.max(sel.y, sel.y + sel.height) * sy), 0, frame.height)
  if (x2 - x1 < 1 || y2 - y1 < 1) return null
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function clampInt(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** Physical capture size for a display. */
export function physicalSize(bounds: Size, scaleFactor: number): Size {
  return {
    width: Math.round(bounds.width * scaleFactor),
    height: Math.round(bounds.height * scaleFactor)
  }
}

export function isValidSelection(v: unknown): v is SelectionRect {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)
  )
}

export function screenshotName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `Screenshot ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} at ${p(
    date.getHours()
  )}.${p(date.getMinutes())}.${p(date.getSeconds())}`
}

const MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/bmp', bytes: [0x42, 0x4d] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }
]

/** Sniffs formats Chromium can decode directly; anything else goes through NSImage. */
export function sniffImageMime(buf: Uint8Array): string | null {
  for (const m of MAGIC) {
    const o = m.offset ?? 0
    if (buf.length >= o + m.bytes.length && m.bytes.every((b, i) => buf[o + i] === b)) {
      return m.mime
    }
  }
  return null
}
