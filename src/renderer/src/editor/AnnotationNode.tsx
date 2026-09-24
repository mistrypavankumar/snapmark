import type Konva from 'konva'
import type { Context } from 'konva/lib/Context'
import { memo } from 'react'
import { Ellipse, Line, Rect, Shape, Text } from 'react-konva'
import { arrowHeadLength, calloutGeometry, withAlpha, type CalloutGeometry } from '../lib/geometry'
import { CALLOUT_WEIGHT, FONT_FAMILY, LINE_HEIGHT, TEXT_WEIGHT, canvasMeasurer, fontString } from '../lib/text'
import type { Annotation, Point } from '../lib/types'

export interface NodeHandlers {
  onPointerDown?: (e: Konva.KonvaEventObject<PointerEvent>, a: Annotation) => void
  onDblClick?: (a: Annotation) => void
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>, a: Annotation) => void
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, a: Annotation) => void
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>, a: Annotation) => void
}

interface Props extends NodeHandlers {
  a: Annotation
  draggable: boolean
  listening: boolean
  /** Extra hit area in image pixels so thin strokes are easy to grab. */
  hitSlop: number
  /** Hide text while it's being edited in the overlay. */
  hideText?: boolean
}

/** Arrow with a sharp head: the shaft stops inside the head so thick round caps never blunt the tip. */
function arrowPath(ctx: Context, from: Point, to: Point, strokeWidth: number) {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  if (len < 0.01) return null
  const head = Math.min(arrowHeadLength(strokeWidth), len)
  const ux = (to.x - from.x) / len
  const uy = (to.y - from.y) / len
  const spread = head * 0.58
  const bx = to.x - ux * head
  const by = to.y - uy * head
  return {
    shaft: () => {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x - ux * head * 0.7, to.y - uy * head * 0.7)
    },
    head: () => {
      ctx.beginPath()
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(bx - uy * spread, by + ux * spread)
      // Slight inward notch reads as a crisp, modern arrowhead.
      ctx.lineTo(to.x - ux * head * 0.82, to.y - uy * head * 0.82)
      ctx.lineTo(bx + uy * spread, by - ux * spread)
      ctx.closePath()
    }
  }
}

function roundRectPath(ctx: Context, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function tailPath(ctx: Context, tail: NonNullable<CalloutGeometry['tail']>, ox: number, oy: number) {
  const o = (p: Point) => ({ x: p.x - ox, y: p.y - oy })
  const b1 = o(tail.base1)
  const b2 = o(tail.base2)
  const tip = o(tail.tip)
  const mid = lerp(o(tail.anchor), tip, 0.5)
  // Slightly concave sides give the pointer its tapered look.
  const c1 = lerp(lerp(b1, tip, 0.5), mid, 0.28)
  const c2 = lerp(lerp(b2, tip, 0.5), mid, 0.28)
  ctx.beginPath()
  ctx.moveTo(b1.x, b1.y)
  ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y)
  ctx.quadraticCurveTo(c2.x, c2.y, b2.x, b2.y)
  ctx.closePath()
}

/** Reads callout attrs from the node; tip is absolute so dragging the label keeps it pinned. */
function nodeCalloutGeometry(shape: Konva.Shape) {
  return calloutGeometry(
    {
      x: shape.x(),
      y: shape.y(),
      tipX: shape.getAttr('tipX'),
      tipY: shape.getAttr('tipY'),
      text: shape.getAttr('text'),
      fontSize: shape.getAttr('fontSize'),
      padding: shape.getAttr('padding')
    },
    canvasMeasurer
  )
}

function drawCallout(ctx: Context, shape: Konva.Shape, hit: boolean) {
  const g = nodeCalloutGeometry(shape)
  const ox = shape.x()
  const oy = shape.y()
  // Label and tail are filled as separate paths: the tail's base sits inside
  // the label, and a combined path could cancel where windings differ.
  roundRectPath(ctx, 0, 0, g.label.w, g.label.h, g.radius)
  ctx.fillShape(shape)
  if (g.tail) {
    tailPath(ctx, g.tail, ox, oy)
    ctx.fillShape(shape)
  }
  if (hit || shape.getAttr('hideText')) return
  ctx.setAttr('fillStyle', shape.getAttr('textColor'))
  ctx.setAttr('font', fontString(shape.getAttr('fontSize'), CALLOUT_WEIGHT))
  ctx.setAttr('textBaseline', 'middle')
  ctx.setAttr('textAlign', 'left')
  g.lines.forEach((line, i) => {
    ctx.fillText(line, g.padX, g.padY + i * g.lineHeight + g.lineHeight / 2)
  })
}

function AnnotationNodeImpl({ a, draggable, listening, hitSlop, hideText, ...h }: Props) {
  const common = {
    id: a.id,
    name: 'annotation',
    opacity: a.opacity,
    draggable,
    listening,
    perfectDrawEnabled: false,
    onPointerDown: h.onPointerDown ? (e: Konva.KonvaEventObject<PointerEvent>) => h.onPointerDown!(e, a) : undefined,
    onDblClick: h.onDblClick ? () => h.onDblClick!(a) : undefined,
    onDragStart: h.onDragStart ? (e: Konva.KonvaEventObject<DragEvent>) => h.onDragStart!(e, a) : undefined,
    onDragEnd: h.onDragEnd ? (e: Konva.KonvaEventObject<DragEvent>) => h.onDragEnd!(e, a) : undefined,
    onTransformEnd: h.onTransformEnd ? (e: Konva.KonvaEventObject<Event>) => h.onTransformEnd!(e, a) : undefined
  }
  const hitStrokeWidth = a.strokeWidth + hitSlop * 2

  switch (a.type) {
    case 'line':
      return (
        <Line
          {...common}
          points={[a.x1, a.y1, a.x2, a.y2]}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          hitStrokeWidth={hitStrokeWidth}
          lineCap="round"
        />
      )
    case 'arrow':
      return (
        <Shape
          {...common}
          stroke={a.color}
          fill={a.color}
          strokeWidth={a.strokeWidth}
          hitStrokeWidth={hitStrokeWidth}
          lineCap="round"
          lineJoin="round"
          sceneFunc={(ctx, shape) => {
            const p = arrowPath(ctx, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }, a.strokeWidth)
            if (!p) return
            p.shaft()
            ctx.strokeShape(shape)
            p.head()
            ctx.fillShape(shape)
          }}
          hitFunc={(ctx, shape) => {
            ctx.beginPath()
            ctx.moveTo(a.x1, a.y1)
            ctx.lineTo(a.x2, a.y2)
            ctx.fillStrokeShape(shape)
          }}
        />
      )
    case 'rect':
      return (
        <Rect
          {...common}
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          strokeScaleEnabled={false}
          hitStrokeWidth={hitStrokeWidth}
          fill={a.fill === 'none' ? undefined : a.fill === 'tint' ? withAlpha(a.color, 0.25) : a.color}
          // Unfilled boxes are only grabbable by their border so the content inside stays clickable.
          fillEnabled={a.fill !== 'none'}
          lineJoin="round"
        />
      )
    case 'ellipse':
      return (
        <Ellipse
          {...common}
          x={a.x + a.w / 2}
          y={a.y + a.h / 2}
          radiusX={a.w / 2}
          radiusY={a.h / 2}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          strokeScaleEnabled={false}
          hitStrokeWidth={hitStrokeWidth}
          fill={a.fill === 'none' ? undefined : a.fill === 'tint' ? withAlpha(a.color, 0.25) : a.color}
          fillEnabled={a.fill !== 'none'}
        />
      )
    case 'pen':
    case 'highlight':
      return (
        <Line
          {...common}
          points={a.points.length === 2 ? [...a.points, a.points[0] + 0.01, a.points[1]] : a.points}
          stroke={a.color}
          strokeWidth={a.strokeWidth}
          strokeScaleEnabled={false}
          hitStrokeWidth={hitStrokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0}
          globalCompositeOperation={a.type === 'highlight' ? 'multiply' : 'source-over'}
        />
      )
    case 'text':
      return (
        <Text
          {...common}
          x={a.x}
          y={a.y}
          text={a.text}
          fontSize={a.fontSize}
          fontFamily={FONT_FAMILY}
          fontStyle={String(TEXT_WEIGHT)}
          lineHeight={LINE_HEIGHT}
          fill={a.color}
          visible={!hideText}
          hitStrokeWidth={0}
        />
      )
    case 'callout':
      return (
        <Shape
          {...common}
          x={a.x}
          y={a.y}
          tipX={a.tipX}
          tipY={a.tipY}
          text={a.text}
          fontSize={a.fontSize}
          padding={a.padding}
          textColor={a.textColor}
          hideText={!!hideText}
          fill={a.color}
          sceneFunc={(ctx, shape) => drawCallout(ctx, shape, false)}
          hitFunc={(ctx, shape) => drawCallout(ctx, shape, true)}
        />
      )
  }
}

export const AnnotationNode = memo(AnnotationNodeImpl)
