import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, canRedo, canUndo, commit, createHistory, redo, undo } from '@renderer/lib/history'

describe('history', () => {
  it('undoes and redoes commits in order', () => {
    let h = createHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    expect(h.present).toBe(2)
    h = undo(h)
    expect(h.present).toBe(1)
    h = undo(h)
    expect(h.present).toBe(0)
    expect(canUndo(h)).toBe(false)
    h = redo(h)
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
  })

  it('clears the redo stack on a new commit', () => {
    let h = commit(commit(createHistory(0), 1), 2)
    h = commit(undo(h), 3)
    expect(h.present).toBe(3)
    expect(canRedo(h)).toBe(false)
    expect(undo(h).present).toBe(1)
  })

  it('coalesces commits that share a key into one undo step', () => {
    let h = createHistory(0)
    h = commit(h, 1, 'slider')
    h = commit(h, 2, 'slider')
    h = commit(h, 3, 'slider')
    expect(h.past).toEqual([0])
    expect(undo(h).present).toBe(0)
    // A different key starts a new step.
    h = commit(h, 4, 'other')
    expect(undo(h).present).toBe(3)
  })

  it('does not coalesce across an undo', () => {
    let h = commit(createHistory(0), 1, 'k')
    h = redo(undo(h))
    h = commit(h, 2, 'k')
    expect(undo(h).present).toBe(1)
  })

  it('ignores a commit of the identical present', () => {
    const h = createHistory({ a: 1 })
    expect(commit(h, h.present)).toBe(h)
  })

  it('caps the number of undo steps', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i)
    expect(h.past.length).toBe(HISTORY_LIMIT)
    expect(h.past[0]).toBe(50)
  })

  it('treats undo/redo at the ends as no-ops', () => {
    const h = createHistory(0)
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})
