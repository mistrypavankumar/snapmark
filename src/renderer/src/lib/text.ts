import type { TextMeasurer } from './types'

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif'

export const LINE_HEIGHT = 1.25
export const TEXT_WEIGHT = 600
export const CALLOUT_WEIGHT = 700

export function fontString(fontSize: number, weight: number) {
  return `${weight} ${fontSize}px ${FONT_FAMILY}`
}

export interface TextLayout {
  lines: string[]
  width: number
  height: number
  lineHeight: number
}

/** Explicit-newline layout; labels grow to fit rather than wrapping. */
export function layoutText(
  text: string,
  fontSize: number,
  weight: number,
  measure: TextMeasurer
): TextLayout {
  const font = fontString(fontSize, weight)
  const lines = text.split('\n')
  const lineHeight = fontSize * LINE_HEIGHT
  let width = 0
  for (const line of lines) width = Math.max(width, measure(line, font))
  return { lines, width, height: lines.length * lineHeight, lineHeight }
}

let measureCtx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/** Canvas-backed text measurement (renderer only). */
export const canvasMeasurer: TextMeasurer = (text, font) => {
  const key = `${font}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 10
  measureCtx.font = font
  const width = measureCtx.measureText(text).width
  if (cache.size > 4000) cache.clear()
  cache.set(key, width)
  return width
}
