export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Key of the last commit; consecutive commits with the same key merge. */
  lastKey: string | null
}

export const HISTORY_LIMIT = 200

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [], lastKey: null }
}

/**
 * Records `next` as the present. Passing the same `coalesceKey` as the
 * previous commit replaces the present instead of adding an undo step, so a
 * slider drag or a burst of arrow-key nudges undoes in one step.
 */
export function commit<T>(h: History<T>, next: T, coalesceKey: string | null = null): History<T> {
  if (Object.is(next, h.present)) return h
  if (coalesceKey !== null && coalesceKey === h.lastKey) {
    return { past: h.past, present: next, future: [], lastKey: coalesceKey }
  }
  const past = [...h.past, h.present]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, present: next, future: [], lastKey: coalesceKey }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    lastKey: null
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present, future, lastKey: null }
}

export const canUndo = (h: History<unknown>) => h.past.length > 0
export const canRedo = (h: History<unknown>) => h.future.length > 0
