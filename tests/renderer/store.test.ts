import { beforeEach, describe, expect, it } from 'vitest'
import { createEditorStore, selectDirty, type EditorStore } from '@renderer/editor/store'
import type { Annotation, CalloutAnnotation, TextAnnotation } from '@renderer/lib/types'

const text = (id: string, value: string): TextAnnotation => ({
  id,
  type: 'text',
  x: 10,
  y: 10,
  text: value,
  fontSize: 22,
  color: '#e5372b',
  strokeWidth: 4,
  opacity: 1
})

const callout = (id: string): CalloutAnnotation => ({
  id,
  type: 'callout',
  x: 100,
  y: 50,
  tipX: 20,
  tipY: 200,
  text: 'Message',
  fontSize: 22,
  padding: 9,
  textColor: '#ffffff',
  color: '#e5372b',
  strokeWidth: 4,
  opacity: 1
})

const arrow = (id: string): Annotation => ({
  id,
  type: 'arrow',
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 50,
  color: '#e5372b',
  strokeWidth: 4,
  opacity: 1
})

let store: EditorStore

beforeEach(() => {
  store = createEditorStore()
  store.getState().init({ el: {} as CanvasImageSource, width: 1400, height: 900, name: 'test' })
})

const doc = () => store.getState().history.present

describe('editor store', () => {
  it('adds a new text annotation only once it has text', () => {
    const s = store.getState()
    s.startEditing(text('t1', ''), true)
    s.finishEditing()
    expect(doc()).toHaveLength(0)

    s.startEditing(text('t2', ''), true)
    store.getState().setEditingText('Hello')
    store.getState().finishEditing()
    expect(doc()).toHaveLength(1)
    expect((doc()[0] as TextAnnotation).text).toBe('Hello')
  })

  it('removes an existing annotation whose text is cleared', () => {
    const s = store.getState()
    s.add(callout('c1'))
    s.startEditing(doc()[0] as CalloutAnnotation, false)
    store.getState().setEditingText('   ')
    store.getState().finishEditing()
    expect(doc()).toHaveLength(0)
    // …and the removal is undoable.
    store.getState().undo()
    expect(doc()).toHaveLength(1)
  })

  it('commits an edit of existing text as one undo step', () => {
    const s = store.getState()
    s.add(callout('c1'))
    s.startEditing(doc()[0] as CalloutAnnotation, false)
    store.getState().setEditingText('Click here')
    store.getState().setEditingText('Click here\nthen save')
    store.getState().finishEditing()
    expect((doc()[0] as CalloutAnnotation).text).toBe('Click here\nthen save')
    store.getState().undo()
    expect((doc()[0] as CalloutAnnotation).text).toBe('Message')
  })

  it('makes clear-all undoable', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    s.add(arrow('a2'))
    s.clear()
    expect(doc()).toHaveLength(0)
    expect(store.getState().selectedId).toBeNull()
    store.getState().undo()
    expect(doc()).toHaveLength(2)
  })

  it('applies style changes to the selection and coalesces slider drags', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    expect(store.getState().selectedId).toBe('a1')
    const stepsBefore = store.getState().history.past.length
    s.setStyle({ strokeWidth: 6 }, { coalesce: true })
    s.setStyle({ strokeWidth: 8 }, { coalesce: true })
    s.setStyle({ strokeWidth: 10 }, { coalesce: true })
    expect(doc()[0].strokeWidth).toBe(10)
    expect(store.getState().history.past.length).toBe(stepsBefore + 1)
    // The style becomes the default for the next arrow.
    expect(store.getState().styles.arrow.strokeWidth).toBe(10)
    store.getState().undo()
    expect(doc()[0].strokeWidth).toBe(4)
  })

  it('ends coalescing so the next drag is a separate step', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    s.setStyle({ strokeWidth: 6 }, { coalesce: true })
    s.endCoalesce()
    s.setStyle({ strokeWidth: 9 }, { coalesce: true })
    store.getState().undo()
    expect(doc()[0].strokeWidth).toBe(6)
  })

  it('only applies fields that the type supports', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    s.setStyle({ fontSize: 99, fill: 'solid' })
    const a = doc()[0] as unknown as Record<string, unknown>
    expect(a.fontSize).toBeUndefined()
    expect(a.fill).toBeUndefined()
  })

  it('picks a readable text color when a callout color changes', () => {
    const s = store.getState()
    s.add(callout('c1'))
    s.setStyle({ color: '#ffe14d' })
    expect((doc()[0] as CalloutAnnotation).textColor).toBe('#111111')
    s.setStyle({ color: '#1c1c1e' })
    expect((doc()[0] as CalloutAnnotation).textColor).toBe('#ffffff')
  })

  it('tracks unsaved changes against the last save', () => {
    const s = store.getState()
    expect(selectDirty(store.getState())).toBe(false)
    s.add(arrow('a1'))
    expect(selectDirty(store.getState())).toBe(true)
    store.getState().markSaved()
    expect(selectDirty(store.getState())).toBe(false)
    store.getState().undo()
    expect(selectDirty(store.getState())).toBe(true)
  })

  it('nudges coalesce, duplicates offset, and reorders the selection', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    s.nudgeSelected(1, 0)
    store.getState().nudgeSelected(1, 0)
    expect((doc()[0] as { x1: number }).x1).toBe(2)
    store.getState().undo()
    expect((doc()[0] as { x1: number }).x1).toBe(0)

    store.getState().duplicateSelected()
    expect(doc()).toHaveLength(2)
    const copy = doc()[1] as { id: string; x1: number }
    expect(copy.id).not.toBe('a1')
    expect(copy.x1).toBeGreaterThan(0)
    expect(store.getState().selectedId).toBe(copy.id)
    store.getState().reorderSelected('back')
    expect(doc()[0].id).toBe(copy.id)
  })

  it('drops a selection that undo removed', () => {
    const s = store.getState()
    s.add(arrow('a1'))
    expect(store.getState().selectedId).toBe('a1')
    store.getState().undo()
    expect(store.getState().selectedId).toBeNull()
  })
})
