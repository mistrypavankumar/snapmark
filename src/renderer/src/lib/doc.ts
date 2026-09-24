import type { Annotation } from './types'

/** Pure operations on the ordered annotation list (index = z-order). */

export function addAnnotation(list: readonly Annotation[], a: Annotation): Annotation[] {
  return [...list, a]
}

export function replaceAnnotation(list: readonly Annotation[], next: Annotation): Annotation[] {
  const i = list.findIndex((a) => a.id === next.id)
  if (i < 0) return list as Annotation[]
  const copy = list.slice()
  copy[i] = next
  return copy
}

export function removeAnnotation(list: readonly Annotation[], id: string): Annotation[] {
  const next = list.filter((a) => a.id !== id)
  return next.length === list.length ? (list as Annotation[]) : next
}

export type ReorderOp = 'forward' | 'backward' | 'front' | 'back'

export function reorder(list: readonly Annotation[], id: string, op: ReorderOp): Annotation[] {
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) return list as Annotation[]
  const target =
    op === 'forward'
      ? Math.min(list.length - 1, i + 1)
      : op === 'backward'
        ? Math.max(0, i - 1)
        : op === 'front'
          ? list.length - 1
          : 0
  if (target === i) return list as Annotation[]
  const copy = list.slice()
  const [item] = copy.splice(i, 1)
  copy.splice(target, 0, item)
  return copy
}

let counter = 0
export function newId(): string {
  counter += 1
  return `a${Date.now().toString(36)}${counter.toString(36)}`
}
