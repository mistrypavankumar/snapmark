import { describe, expect, it } from 'vitest'
import {
  isValidSelection,
  physicalSize,
  screenshotName,
  selectionToPixels,
  sniffImageMime
} from '../../src/main/captureMath'

describe('selectionToPixels', () => {
  it('maps DIPs to physical pixels on a 2× Retina display', () => {
    const r = selectionToPixels({ x: 10, y: 20, width: 100, height: 50 }, { width: 1512, height: 982 }, { width: 3024, height: 1964 })
    expect(r).toEqual({ x: 20, y: 40, width: 200, height: 100 })
  })

  it('uses the real frame ratio for scaled modes', () => {
    // "More Space" style: 1800×1169 points backed by a 3024×1964 frame (1.68×).
    const r = selectionToPixels({ x: 100, y: 100, width: 100, height: 100 }, { width: 1800, height: 1169 }, { width: 3024, height: 1964 })!
    expect(r.x).toBe(168)
    expect(r.width).toBe(168)
  })

  it('rounds outward so partially covered pixels are kept', () => {
    const r = selectionToPixels({ x: 10.3, y: 10.3, width: 10.2, height: 10.2 }, { width: 100, height: 100 }, { width: 150, height: 150 })!
    // 15.45 → 15 and 30.75 → 31.
    expect(r).toEqual({ x: 15, y: 15, width: 16, height: 16 })
  })

  it('clamps to the frame', () => {
    const r = selectionToPixels({ x: -20, y: -20, width: 2000, height: 2000 }, { width: 1000, height: 500 }, { width: 2000, height: 1000 })
    expect(r).toEqual({ x: 0, y: 0, width: 2000, height: 1000 })
  })

  it('normalizes a selection with negative size', () => {
    const r = selectionToPixels({ x: 60, y: 60, width: -50, height: -50 }, { width: 100, height: 100 }, { width: 200, height: 200 })
    expect(r).toEqual({ x: 20, y: 20, width: 100, height: 100 })
  })

  it('rejects empty or off-screen selections', () => {
    expect(selectionToPixels({ x: 5, y: 5, width: 0, height: 10 }, { width: 100, height: 100 }, { width: 200, height: 200 })).toBeNull()
    expect(selectionToPixels({ x: 500, y: 500, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 200, height: 200 })).toBeNull()
    expect(selectionToPixels({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }, { width: 200, height: 200 })).toBeNull()
  })
})

describe('helpers', () => {
  it('computes physical display size', () => {
    expect(physicalSize({ width: 1512, height: 982 }, 2)).toEqual({ width: 3024, height: 1964 })
    expect(physicalSize({ width: 1280, height: 720 }, 1.5)).toEqual({ width: 1920, height: 1080 })
  })

  it('validates selection payloads from the renderer', () => {
    expect(isValidSelection({ x: 1, y: 2, width: 3, height: 4 })).toBe(true)
    expect(isValidSelection({ x: 1, y: 2, width: 3 })).toBe(false)
    expect(isValidSelection({ x: 1, y: 2, width: NaN, height: 4 })).toBe(false)
    expect(isValidSelection({ x: '1', y: 2, width: 3, height: 4 })).toBe(false)
    expect(isValidSelection(null)).toBe(false)
  })

  it('names screenshots like macOS does', () => {
    expect(screenshotName(new Date(2026, 8, 4, 9, 5, 7))).toBe('Screenshot 2026-09-04 at 09.05.07')
  })

  it('sniffs image formats from magic bytes', () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png')
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(sniffImageMime(webp)).toBe('image/webp')
    // HEIC isn't decodable by Chromium, so it falls through to NSImage.
    expect(sniffImageMime(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBeNull()
    expect(sniffImageMime(new Uint8Array([0x89]))).toBeNull()
  })
})
