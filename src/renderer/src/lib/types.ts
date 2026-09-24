/**
 * Annotation geometry is stored in *image* coordinates (source pixels of the
 * screenshot). The view maps image → screen with a single zoom/pan transform,
 * so annotations stay aligned at every zoom level and export 1:1.
 */

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type FillMode = 'none' | 'tint' | 'solid'

interface Base {
  id: string
  color: string
  strokeWidth: number
  opacity: number
}

export interface LineAnnotation extends Base {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface BoxAnnotation extends Base {
  type: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
  fill: FillMode
}

export interface StrokeAnnotation extends Base {
  /** `highlight` is a translucent marker drawn with multiply blending. */
  type: 'pen' | 'highlight'
  /** Flat [x0, y0, x1, y1, …] in image coordinates. */
  points: number[]
}

export interface TextAnnotation extends Base {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
}

/**
 * Message callout: solid rounded label with bold text and a tapered pointer
 * whose tip is at (tipX, tipY). The label size is derived from its content.
 */
export interface CalloutAnnotation extends Base {
  type: 'callout'
  /** Top-left of the label. */
  x: number
  y: number
  tipX: number
  tipY: number
  text: string
  fontSize: number
  padding: number
  textColor: string
}

export type Annotation =
  | LineAnnotation
  | BoxAnnotation
  | StrokeAnnotation
  | TextAnnotation
  | CalloutAnnotation

export type AnnotationType = Annotation['type']
export type Tool = 'select' | AnnotationType

export interface StyleSettings {
  color: string
  strokeWidth: number
  fontSize: number
  fill: FillMode
  opacity: number
  padding: number
}

export type TextMeasurer = (text: string, font: string) => number
