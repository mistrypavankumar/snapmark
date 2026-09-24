import { CALLOUT_WEIGHT, TEXT_WEIGHT, layoutText } from './text'
import type {
  Annotation,
  AnnotationType,
  CalloutAnnotation,
  Point,
  Rect,
  StyleSettings,
  TextMeasurer
} from './types'

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

export function pointInRect(p: Point, r: Rect) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/** Snaps `to` so the segment from `from` is a multiple of 45°. */
export function snapAngle(from: Point, to: Point): Point {
  const len = dist(from, to)
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len }
}

/** Constrains the box from anchor `a` toward `b` to a square. */
export function squareFrom(a: Point, b: Point): Point {
  const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  return { x: a.x + Math.sign(b.x - a.x || 1) * size, y: a.y + Math.sign(b.y - a.y || 1) * size }
}

// ---------------------------------------------------------------------------
// View (zoom/pan). `zoom` is CSS pixels per image pixel.
// ---------------------------------------------------------------------------

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 16

export interface View {
  zoom: number
  pan: Point
}

/**
 * Fits the image in the viewport, centered. Never enlarges past 1 image pixel
 * per device pixel, so a Retina capture fits at its on-screen size.
 */
export function fitView(viewW: number, viewH: number, imageW: number, imageH: number, dpr: number, margin = 32): View {
  const w = Math.max(1, viewW - margin * 2)
  const h = Math.max(1, viewH - margin * 2)
  const zoom = clamp(Math.min(w / imageW, h / imageH, 1 / dpr), MIN_ZOOM, MAX_ZOOM)
  return { zoom, pan: { x: (viewW - imageW * zoom) / 2, y: (viewH - imageH * zoom) / 2 } }
}

/** Zooms to `nextZoom` keeping the image point under `anchor` (screen coords) fixed. */
export function zoomAt(view: View, nextZoom: number, anchor: Point): View {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  const k = zoom / view.zoom
  return {
    zoom,
    pan: { x: anchor.x - (anchor.x - view.pan.x) * k, y: anchor.y - (anchor.y - view.pan.y) * k }
  }
}

export function screenToImage(p: Point, view: View): Point {
  return { x: (p.x - view.pan.x) / view.zoom, y: (p.y - view.pan.y) / view.zoom }
}

export function imageToScreen(p: Point, view: View): Point {
  return { x: p.x * view.zoom + view.pan.x, y: p.y * view.zoom + view.pan.y }
}

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16]

/** Next preset zoom in device-pixel percent terms (100% = 1 image px per device px). */
export function stepZoom(zoom: number, dpr: number, dir: 1 | -1): number {
  const actual = zoom * dpr
  const eps = 1e-3
  const next =
    dir > 0 ? ZOOM_STEPS.find((s) => s > actual + eps) : [...ZOOM_STEPS].reverse().find((s) => s < actual - eps)
  return clamp((next ?? actual) / dpr, MIN_ZOOM, MAX_ZOOM)
}

// ---------------------------------------------------------------------------
// Callout geometry
// ---------------------------------------------------------------------------

export interface CalloutGeometry {
  label: Rect
  radius: number
  padX: number
  padY: number
  lineHeight: number
  lines: string[]
  /** Null when the tip is inside the label. */
  tail: { base1: Point; base2: Point; anchor: Point; tip: Point } | null
}

type CalloutShape = Pick<CalloutAnnotation, 'x' | 'y' | 'tipX' | 'tipY' | 'text' | 'fontSize' | 'padding'>

export function calloutGeometry(c: CalloutShape, measure: TextMeasurer): CalloutGeometry {
  const layout = layoutText(c.text || ' ', c.fontSize, CALLOUT_WEIGHT, measure)
  const padY = c.padding
  const padX = c.padding * 1.35
  const label: Rect = {
    x: c.x,
    y: c.y,
    w: Math.max(layout.width, c.fontSize * 0.6) + padX * 2,
    h: layout.height + padY * 2
  }
  const radius = Math.min(label.h / 2, label.w / 2, c.fontSize * 0.4 + c.padding * 0.5)
  const tip = { x: c.tipX, y: c.tipY }

  let tail: CalloutGeometry['tail'] = null
  if (!pointInRect(tip, label)) {
    // Anchor on the label's spine (inset by half its short side) so the tail
    // leaves from the nearest part of the label; a wide label pointing
    // straight down gets a straight tail.
    const half = Math.min(label.w, label.h) / 2
    const anchor = {
      x: clamp(tip.x, label.x + half, label.x + label.w - half),
      y: clamp(tip.y, label.y + half, label.y + label.h - half)
    }
    const len = dist(anchor, tip)
    if (len > 0) {
      const baseHalf = clamp(Math.min(c.fontSize * 0.55, half * 0.8), 1, half)
      const px = -(tip.y - anchor.y) / len
      const py = (tip.x - anchor.x) / len
      tail = {
        anchor,
        tip,
        base1: { x: anchor.x + px * baseHalf, y: anchor.y + py * baseHalf },
        base2: { x: anchor.x - px * baseHalf, y: anchor.y - py * baseHalf }
      }
    }
  }
  return { label, radius, padX, padY, lineHeight: layout.lineHeight, lines: layout.lines, tail }
}

export function textSize(text: string, fontSize: number, measure: TextMeasurer) {
  const l = layoutText(text || ' ', fontSize, TEXT_WEIGHT, measure)
  return { w: Math.max(l.width, fontSize * 0.5), h: l.height }
}

// ---------------------------------------------------------------------------
// Transforms (pure)
// ---------------------------------------------------------------------------

/** Moves the whole annotation, including a callout's tip (used for nudging). */
export function translate<T extends Annotation>(a: T, dx: number, dy: number): T {
  switch (a.type) {
    case 'line':
    case 'arrow':
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
    case 'pen':
    case 'highlight':
      return { ...a, points: a.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) }
    case 'callout':
      return { ...a, x: a.x + dx, y: a.y + dy, tipX: a.tipX + dx, tipY: a.tipY + dy }
    default:
      return { ...a, x: a.x + dx, y: a.y + dy }
  }
}

/**
 * Drag-to-move semantics: a callout's label moves while its tip stays on the
 * spot it points at. Everything else moves as a whole.
 */
export function dragMove<T extends Annotation>(a: T, dx: number, dy: number): T {
  if (a.type === 'callout') return { ...a, x: a.x + dx, y: a.y + dy }
  return translate(a, dx, dy)
}

export interface NodeTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

/**
 * Bakes a Konva node transform (from the Transformer) into the annotation's
 * geometry so the stored model never carries a scale. For box/text nodes,
 * (x, y) is the node's new position; stroke nodes are drawn at the origin, so
 * (x, y) is their offset.
 */
export function bakeTransform<T extends Annotation>(a: T, t: NodeTransform): T {
  const sx = Math.abs(t.scaleX)
  const sy = Math.abs(t.scaleY)
  switch (a.type) {
    case 'rect':
      return { ...a, x: t.x, y: t.y, w: a.w * sx, h: a.h * sy }
    case 'ellipse': {
      // Ellipse nodes are positioned at their center.
      const w = a.w * sx
      const h = a.h * sy
      return { ...a, x: t.x - w / 2, y: t.y - h / 2, w, h }
    }
    case 'pen':
    case 'highlight':
      return { ...a, points: a.points.map((v, i) => (i % 2 === 0 ? v * sx + t.x : v * sy + t.y)) }
    case 'text':
      return { ...a, x: t.x, y: t.y, fontSize: Math.max(4, Math.round(a.fontSize * sy * 10) / 10) }
    default:
      return a
  }
}

export function setLineEndpoint<T extends Annotation>(a: T, which: 'start' | 'end', p: Point, constrain = false): T {
  if (a.type !== 'line' && a.type !== 'arrow') return a
  if (which === 'start') {
    const q = constrain ? snapAngle({ x: a.x2, y: a.y2 }, p) : p
    return { ...a, x1: q.x, y1: q.y }
  }
  const q = constrain ? snapAngle({ x: a.x1, y: a.y1 }, p) : p
  return { ...a, x2: q.x, y2: q.y }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Which style controls apply to each annotation type. */
export const STYLE_FIELDS: Record<AnnotationType, ReadonlyArray<keyof StyleSettings>> = {
  arrow: ['color', 'strokeWidth', 'opacity'],
  line: ['color', 'strokeWidth', 'opacity'],
  rect: ['color', 'strokeWidth', 'fill', 'opacity'],
  ellipse: ['color', 'strokeWidth', 'fill', 'opacity'],
  pen: ['color', 'strokeWidth', 'opacity'],
  highlight: ['color', 'strokeWidth', 'opacity'],
  text: ['color', 'fontSize', 'opacity'],
  callout: ['color', 'fontSize', 'padding', 'opacity']
}

export function applyStyle<T extends Annotation>(a: T, s: Partial<StyleSettings>): T {
  const fields = STYLE_FIELDS[a.type]
  const next = { ...a } as Record<string, unknown>
  for (const key of fields) {
    if (s[key] !== undefined) next[key] = s[key]
  }
  if (a.type === 'callout' && s.color !== undefined) next.textColor = readableTextColor(s.color)
  return next as T
}

export function styleOf(a: Annotation): Partial<StyleSettings> {
  const s: Partial<StyleSettings> = { color: a.color, strokeWidth: a.strokeWidth, opacity: a.opacity }
  if (a.type === 'rect' || a.type === 'ellipse') s.fill = a.fill
  if (a.type === 'text' || a.type === 'callout') s.fontSize = a.fontSize
  if (a.type === 'callout') s.padding = a.padding
  return s
}

/** White or near-black, whichever contrasts better with `bg` (#rrggbb). */
export function readableTextColor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.4 ? '#111111' : '#ffffff'
}

/** `#rrggbb` + alpha → rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Whether a just-drawn shape is big enough to keep (guards stray clicks). */
export function isMeaningful(a: Annotation, minSize: number): boolean {
  switch (a.type) {
    case 'line':
    case 'arrow':
      return Math.hypot(a.x2 - a.x1, a.y2 - a.y1) >= minSize
    case 'rect':
    case 'ellipse':
      return a.w >= minSize && a.h >= minSize
    case 'pen':
    case 'highlight':
      return a.points.length >= 2
    default:
      return true
  }
}

export function arrowHeadLength(strokeWidth: number) {
  return Math.max(12, strokeWidth * 3.6)
}

/** Visual bounds of an annotation in image coordinates, including stroke and arrowhead. */
export function annotationBounds(a: Annotation, measure: TextMeasurer): Rect {
  const fromPoints = (xs: number[], ys: number[], pad: number): Rect => {
    const x = Math.min(...xs) - pad
    const y = Math.min(...ys) - pad
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
  }
  switch (a.type) {
    case 'line':
      return fromPoints([a.x1, a.x2], [a.y1, a.y2], a.strokeWidth / 2)
    case 'arrow':
      // The head's half-width is 0.58 × its length.
      return fromPoints([a.x1, a.x2], [a.y1, a.y2], Math.max(a.strokeWidth / 2, arrowHeadLength(a.strokeWidth) * 0.58))
    case 'rect':
    case 'ellipse':
      return { x: a.x - a.strokeWidth / 2, y: a.y - a.strokeWidth / 2, w: a.w + a.strokeWidth, h: a.h + a.strokeWidth }
    case 'pen':
    case 'highlight':
      return fromPoints(
        a.points.filter((_, i) => i % 2 === 0),
        a.points.filter((_, i) => i % 2 === 1),
        a.strokeWidth / 2
      )
    case 'text': {
      const size = textSize(a.text, a.fontSize, measure)
      return { x: a.x, y: a.y, w: size.w, h: size.h }
    }
    case 'callout': {
      const { label } = calloutGeometry(a, measure)
      return fromPoints([label.x, label.x + label.w, a.tipX], [label.y, label.y + label.h, a.tipY], 0)
    }
  }
}

/**
 * The exported area: the whole image, grown to include any annotation that
 * extends past its edges (plus a small margin on those sides). Integer pixels.
 */
export function exportBounds(imageW: number, imageH: number, annotations: readonly Annotation[], measure: TextMeasurer): Rect {
  let x1 = 0
  let y1 = 0
  let x2 = imageW
  let y2 = imageH
  for (const a of annotations) {
    const b = annotationBounds(a, measure)
    x1 = Math.min(x1, b.x)
    y1 = Math.min(y1, b.y)
    x2 = Math.max(x2, b.x + b.w)
    y2 = Math.max(y2, b.y + b.h)
  }
  const margin = clamp(Math.round(Math.max(imageW, imageH) / 150), 4, 24)
  const left = x1 < 0 ? Math.floor(x1) - margin : 0
  const top = y1 < 0 ? Math.floor(y1) - margin : 0
  const right = x2 > imageW ? Math.ceil(x2) + margin : imageW
  const bottom = y2 > imageH ? Math.ceil(y2) + margin : imageH
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export const RED = '#e5372b'

/** Per-tool defaults, scaled so strokes and text look right on 5K captures too. */
export function defaultStyles(imageW: number, imageH: number): Record<AnnotationType, StyleSettings> {
  const unit = clamp(Math.max(imageW, imageH) / 1400, 1, 4)
  const base: StyleSettings = {
    color: RED,
    strokeWidth: Math.round(4 * unit),
    fontSize: Math.round(22 * unit),
    fill: 'none',
    opacity: 1,
    padding: Math.round(9 * unit)
  }
  return {
    arrow: base,
    line: base,
    rect: base,
    ellipse: base,
    pen: base,
    highlight: { ...base, color: '#ffe14d', strokeWidth: Math.round(22 * unit) },
    text: base,
    callout: base
  }
}
