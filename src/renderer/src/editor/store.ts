import { createStore, useStore } from 'zustand'
import { addAnnotation, newId, removeAnnotation, reorder, replaceAnnotation, type ReorderOp } from '../lib/doc'
import { applyStyle, defaultStyles, translate, type View } from '../lib/geometry'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from '../lib/history'
import type {
  Annotation,
  AnnotationType,
  CalloutAnnotation,
  StyleSettings,
  TextAnnotation,
  Tool
} from '../lib/types'

export interface LoadedImage {
  el: CanvasImageSource
  width: number
  height: number
  name: string
}

export interface EditingState {
  annotation: TextAnnotation | CalloutAnnotation
  /** New annotations are only added to the document once they have text. */
  isNew: boolean
}

export type NoticeKind = 'info' | 'success' | 'error'

export interface EditorState {
  image: LoadedImage | null
  history: History<Annotation[]>
  /** Document at the last successful save/copy; used for the unsaved-changes prompt. */
  saved: Annotation[]
  selectedId: string | null
  tool: Tool
  styles: Record<AnnotationType, StyleSettings>
  editing: EditingState | null
  view: View
  fitMode: boolean
  /** True while a node is being dragged; hides handles that would lag behind. */
  dragging: boolean
  notice: { id: number; text: string; kind: NoticeKind } | null

  init(image: LoadedImage): void
  setTool(tool: Tool): void
  select(id: string | null): void
  add(a: Annotation, select?: boolean): void
  update(a: Annotation, coalesceKey?: string | null): void
  remove(id: string): void
  removeSelected(): void
  clear(): void
  undo(): void
  redo(): void
  reorderSelected(op: ReorderOp): void
  duplicateSelected(): void
  nudgeSelected(dx: number, dy: number): void
  setStyle(patch: Partial<StyleSettings>, opts?: { coalesce?: boolean }): void
  startEditing(a: TextAnnotation | CalloutAnnotation, isNew: boolean): void
  setEditingText(text: string): void
  finishEditing(): void
  setView(view: View, fitMode?: boolean): void
  setDragging(dragging: boolean): void
  markSaved(): void
  endCoalesce(): void
  notify(text: string, kind?: NoticeKind): void
}

const initialStyles = defaultStyles(1400, 900)

export function createEditorStore() {
  return createStore<EditorState>()((set, get) => {
    const commitDoc = (next: Annotation[], key: string | null = null) =>
      set((s) => ({ history: commit(s.history, next, key) }))

    const selected = () => {
      const { selectedId, history } = get()
      return selectedId ? history.present.find((a) => a.id === selectedId) : undefined
    }

    return {
      image: null,
      history: createHistory<Annotation[]>([]),
      saved: [],
      selectedId: null,
      tool: 'arrow',
      styles: initialStyles,
      editing: null,
      view: { zoom: 1, pan: { x: 0, y: 0 } },
      fitMode: true,
      dragging: false,
      notice: null,

      init(image) {
        const history = createHistory<Annotation[]>([])
        set({
          image,
          history,
          saved: history.present,
          selectedId: null,
          editing: null,
          styles: defaultStyles(image.width, image.height),
          fitMode: true
        })
      },

      setTool(tool) {
        get().finishEditing()
        set({ tool, selectedId: tool === 'select' ? get().selectedId : null })
      },

      select(id) {
        if (get().selectedId !== id) set({ selectedId: id })
      },

      add(a, select = true) {
        commitDoc(addAnnotation(get().history.present, a))
        if (select) set({ selectedId: a.id })
      },

      update(a, coalesceKey = null) {
        commitDoc(replaceAnnotation(get().history.present, a), coalesceKey)
      },

      remove(id) {
        commitDoc(removeAnnotation(get().history.present, id))
        if (get().selectedId === id) set({ selectedId: null })
      },

      removeSelected() {
        const id = get().selectedId
        if (id) get().remove(id)
      },

      clear() {
        set({ editing: null, selectedId: null })
        if (get().history.present.length > 0) commitDoc([])
      },

      undo() {
        set((s) => (canUndo(s.history) ? { history: undo(s.history), editing: null } : {}))
        if (!selected()) set({ selectedId: null })
      },

      redo() {
        set((s) => (canRedo(s.history) ? { history: redo(s.history), editing: null } : {}))
        if (!selected()) set({ selectedId: null })
      },

      reorderSelected(op) {
        const id = get().selectedId
        if (id) commitDoc(reorder(get().history.present, id, op))
      },

      duplicateSelected() {
        const a = selected()
        if (!a) return
        const offset = Math.max(8, a.strokeWidth * 3)
        const copy = { ...translate(a, offset, offset), id: newId() }
        get().add(copy)
      },

      nudgeSelected(dx, dy) {
        const a = selected()
        if (a) get().update(translate(a, dx, dy), `nudge:${a.id}`)
      },

      setStyle(patch, opts = {}) {
        const a = selected()
        const type: AnnotationType | null = a ? a.type : get().tool === 'select' ? null : (get().tool as AnnotationType)
        if (!type) return
        set((s) => ({ styles: { ...s.styles, [type]: { ...s.styles[type], ...patch } } }))
        if (a) {
          const key = opts.coalesce ? `style:${a.id}:${Object.keys(patch).join(',')}` : null
          get().update(applyStyle(a, patch), key)
        }
        const editing = get().editing
        if (editing) set({ editing: { ...editing, annotation: applyStyle(editing.annotation, patch) } })
      },

      startEditing(a, isNew) {
        get().finishEditing()
        set({ editing: { annotation: a, isNew }, selectedId: isNew ? null : a.id })
      },

      setEditingText(text) {
        const e = get().editing
        if (e) set({ editing: { ...e, annotation: { ...e.annotation, text } } })
      },

      finishEditing() {
        const e = get().editing
        if (!e) return
        set({ editing: null })
        const a = e.annotation
        const empty = a.text.trim() === ''
        if (e.isNew) {
          if (!empty) get().add(a)
          return
        }
        const current = get().history.present.find((x) => x.id === a.id)
        if (!current) return
        if (empty) get().remove(a.id)
        else if (current !== a) get().update(a)
      },

      setView(view, fitMode = false) {
        set({ view, fitMode })
      },

      setDragging(dragging) {
        if (get().dragging !== dragging) set({ dragging })
      },

      endCoalesce() {
        set((s) => (s.history.lastKey ? { history: { ...s.history, lastKey: null } } : {}))
      },

      markSaved() {
        set((s) => ({ saved: s.history.present }))
      },

      notify(text, kind = 'info') {
        set({ notice: { id: Date.now(), text, kind } })
      }
    }
  })
}

export type EditorStore = ReturnType<typeof createEditorStore>

/** One editor per window. */
export const editorStore = createEditorStore()

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector)
}

export const selectSelected = (s: EditorState) =>
  s.selectedId ? s.history.present.find((a) => a.id === s.selectedId) ?? null : null

export const selectDirty = (s: EditorState) => s.history.present !== s.saved

/** In-progress shape while the pointer is down; kept out of the document store. */
export const draftStore = createStore<{ draft: Annotation | null }>()(() => ({ draft: null }))

/** Replacement for one annotation while a handle is dragged; committed on release. */
export const previewStore = createStore<{ preview: Annotation | null }>()(() => ({ preview: null }))
