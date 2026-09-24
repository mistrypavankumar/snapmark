import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyStyle,
  bakeTransform,
  calloutGeometry,
  defaultStyles,
  dragMove,
  fitView,
  isMeaningful,
  readableTextColor,
  screenToImage,
  setLineEndpoint,
  snapAngle,
  stepZoom,
  translate,
  withAlpha,
  zoomAt
} from '@renderer/lib/geometry'
import type { Annotation, CalloutAnnotation, TextMeasurer } from '@renderer/lib/types'

// Deterministic stand-in for canvas text measurement.
const measure: TextMeasurer = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
  return text.length * size * 0.5
}

const base = { color: '#e5372b', strokeWidth: 4, opacity: 1 }

const callout = (over: Partial<CalloutAnnotation> = {}): CalloutAnnotation => ({
  id: 'c',
  type: 'callout',
  x: 100,
  y: 100,
  tipX: 150,
  tipY: 400,
  text: 'Message',
  fontSize: 20,
  padding: 10,
  textColor: '#fff',
  ...base,
  ...over
})

describe('calloutGeometry', () => {
  it('sizes the label to the text plus padding', () => {
    const g = calloutGeometry(callout(), measure)
    // 7 chars × 10px, plus 13.5px horizontal padding each side.
    expect(g.label.w).toBeCloseTo(70 + 27)
    expect(g.label.h).toBeCloseTo(20 * 1.25 + 20)
    expect(g.lines).toEqual(['Message'])
  })

  it('grows with multiline text', () => {
    const one = calloutGeometry(callout(), measure)
    const two = calloutGeometry(callout({ text: 'Message\nA much longer line' }), measure)
    expect(two.lines).toHaveLength(2)
    expect(two.label.h).toBeGreaterThan(one.label.h)
    expect(two.label.w).toBeGreaterThan(one.label.w)
  })

  it('has no tail when the tip is inside the label', () => {
    const g = calloutGeometry(callout({ tipX: 120, tipY: 110 }), measure)
    expect(g.tail).toBeNull()
  })

  it('ends the tail exactly at the tip, anchored inside the label', () => {
    const g = calloutGeometry(callout({ tipX: 600, tipY: 50 }), measure)
    expect(g.tail).not.toBeNull()
    const t = g.tail!
    expect(t.tip).toEqual({ x: 600, y: 50 })
    const { label } = g
    expect(t.anchor.x).toBeGreaterThanOrEqual(label.x)
    expect(t.anchor.x).toBeLessThanOrEqual(label.x + label.w)
    expect(t.anchor.y).toBeGreaterThanOrEqual(label.y)
    expect(t.anchor.y).toBeLessThanOrEqual(label.y + label.h)
    // The base is perpendicular to the tail and centered on the anchor.
    const dir = { x: t.tip.x - t.anchor.x, y: t.tip.y - t.anchor.y }
    const baseVec = { x: t.base2.x - t.base1.x, y: t.base2.y - t.base1.y }
    expect(dir.x * baseVec.x + dir.y * baseVec.y).toBeCloseTo(0)
    expect((t.base1.x + t.base2.x) / 2).toBeCloseTo(t.anchor.x)
    expect((t.base1.y + t.base2.y) / 2).toBeCloseTo(t.anchor.y)
  })

  it('points straight down from a wide label when the tip is below it', () => {
    const g = calloutGeometry(callout({ text: 'A fairly wide label', tipX: 180, tipY: 400 }), measure)
    expect(g.tail!.anchor.x).toBeCloseTo(180)
  })
})

describe('bakeTransform', () => {
  it('scales a rect and moves it to the node position', () => {
    const r: Annotation = { id: 'r', type: 'rect', x: 10, y: 20, w: 100, h: 50, fill: 'none', ...base }
    expect(bakeTransform(r, { x: 5, y: 6, scaleX: 2, scaleY: 0.5 })).toMatchObject({ x: 5, y: 6, w: 200, h: 25 })
  })

  it('treats the ellipse node position as its center', () => {
    const e: Annotation = { id: 'e', type: 'ellipse', x: 0, y: 0, w: 100, h: 40, fill: 'none', ...base }
    expect(bakeTransform(e, { x: 100, y: 100, scaleX: 2, scaleY: 1 })).toMatchObject({ x: 0, y: 80, w: 200, h: 40 })
  })

  it('bakes scale and offset into stroke points', () => {
    const p: Annotation = { id: 'p', type: 'pen', points: [0, 0, 10, 20], ...base }
    expect(bakeTransform(p, { x: 5, y: 1, scaleX: 2, scaleY: 3 })).toMatchObject({ points: [5, 1, 25, 61] })
  })

  it('scales text by its font size', () => {
    const t: Annotation = { id: 't', type: 'text', x: 0, y: 0, text: 'Hi', fontSize: 20, ...base }
    expect(bakeTransform(t, { x: 3, y: 4, scaleX: 1.5, scaleY: 1.5 })).toMatchObject({ x: 3, y: 4, fontSize: 30 })
  })

  it('leaves point-handle types unchanged', () => {
    const c = callout()
    expect(bakeTransform(c, { x: 0, y: 0, scaleX: 2, scaleY: 2 })).toBe(c)
  })
})

describe('moves', () => {
  it('drag moves only the callout label, keeping the tip pinned', () => {
    const moved = dragMove(callout(), 10, 20)
    expect(moved).toMatchObject({ x: 110, y: 120, tipX: 150, tipY: 400 })
  })

  it('translate (nudge) moves the callout tip too', () => {
    expect(translate(callout(), 10, 20)).toMatchObject({ x: 110, y: 120, tipX: 160, tipY: 420 })
  })

  it('translates line endpoints and stroke points', () => {
    const l: Annotation = { id: 'l', type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10, ...base }
    expect(translate(l, 1, 2)).toMatchObject({ x1: 1, y1: 2, x2: 11, y2: 12 })
    const p: Annotation = { id: 'p', type: 'highlight', points: [0, 0, 5, 5], ...base }
    expect(translate(p, 1, 2)).toMatchObject({ points: [1, 2, 6, 7] })
  })

  it('snaps line endpoints to 45° with shift', () => {
    const l: Annotation = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, ...base }
    const snapped = setLineEndpoint(l, 'end', { x: 100, y: 8 }, true) as { x2: number; y2: number }
    expect(snapped.y2).toBeCloseTo(0)
    const diag = snapAngle({ x: 0, y: 0 }, { x: 10, y: 9 })
    expect(diag.x).toBeCloseTo(diag.y)
  })
})

describe('view math', () => {
  it('fits and centers a large image', () => {
    const v = fitView(1000, 800, 4000, 2000, 2)
    expect(v.zoom).toBeCloseTo((1000 - 64) / 4000)
    expect(v.pan.x).toBeCloseTo((1000 - 4000 * v.zoom) / 2)
    expect(v.pan.y).toBeCloseTo((800 - 2000 * v.zoom) / 2)
  })

  it('never enlarges past one image pixel per device pixel', () => {
    expect(fitView(2000, 2000, 200, 100, 2).zoom).toBe(0.5)
    expect(fitView(2000, 2000, 200, 100, 1).zoom).toBe(1)
  })

  it('keeps the image point under the anchor fixed when zooming', () => {
    const view = { zoom: 0.5, pan: { x: 40, y: -30 } }
    const anchor = { x: 320, y: 210 }
    const before = screenToImage(anchor, view)
    const next = zoomAt(view, 1.7, anchor)
    const after = screenToImage(anchor, next)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom', () => {
    const view = { zoom: 1, pan: { x: 0, y: 0 } }
    expect(zoomAt(view, 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(view, 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM)
  })

  it('steps through preset zoom levels in device-pixel terms', () => {
    // 100% on Retina is zoom 0.5.
    expect(stepZoom(0.5, 2, 1)).toBeCloseTo(1.25 / 2)
    expect(stepZoom(0.5, 2, -1)).toBeCloseTo(0.75 / 2)
    expect(stepZoom(1, 1, 1)).toBeCloseTo(1.25)
    // Between presets, go to the next one in that direction.
    expect(stepZoom(0.9, 1, 1)).toBeCloseTo(1)
    expect(stepZoom(0.9, 1, -1)).toBeCloseTo(0.75)
  })
})

describe('styles', () => {
  it('scales default sizes with the image', () => {
    const small = defaultStyles(1000, 800)
    const big = defaultStyles(5120, 2880)
    expect(big.arrow.strokeWidth).toBeGreaterThan(small.arrow.strokeWidth)
    expect(big.callout.fontSize).toBeGreaterThan(small.callout.fontSize)
    expect(small.highlight.color).toBe('#ffe14d')
  })

  it('applies only supported fields', () => {
    const r: Annotation = { id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'none', ...base }
    expect(applyStyle(r, { fill: 'tint', fontSize: 40 })).toMatchObject({ fill: 'tint' })
    expect('fontSize' in applyStyle(r, { fontSize: 40 })).toBe(false)
  })

  it('picks contrasting callout text', () => {
    expect(readableTextColor('#e5372b')).toBe('#ffffff')
    expect(readableTextColor('#ffffff')).toBe('#111111')
    expect(withAlpha('#ff0000', 0.25)).toBe('rgba(255, 0, 0, 0.25)')
  })

  it('discards stray clicks but keeps dots and text', () => {
    const tiny: Annotation = { id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 30, fill: 'none', ...base }
    expect(isMeaningful(tiny, 3)).toBe(false)
    const dot: Annotation = { id: 'p', type: 'pen', points: [5, 5], ...base }
    expect(isMeaningful(dot, 3)).toBe(true)
  })
})
