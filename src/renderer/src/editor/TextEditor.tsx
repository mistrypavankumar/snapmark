import { useLayoutEffect, useRef } from 'react'
import { calloutGeometry, textSize } from '../lib/geometry'
import { CALLOUT_WEIGHT, FONT_FAMILY, LINE_HEIGHT, TEXT_WEIGHT, canvasMeasurer } from '../lib/text'
import { editorStore, useEditor, type EditingState } from './store'

/**
 * A transparent textarea laid exactly over the annotation's text. The canvas
 * keeps drawing the callout label (resizing live as you type) but skips the
 * text itself, so the textarea supplies the glyphs and a native caret.
 */
export function TextEditor() {
  const editing = useEditor((s) => s.editing)
  if (!editing) return null
  return <TextEditorField key={editing.annotation.id} editing={editing} />
}

function TextEditorField({ editing }: { editing: EditingState }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const view = useEditor((s) => s.view)
  const a = editing.annotation

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Select existing/default text so typing replaces it.
    el.select()
  }, [])

  const { zoom, pan } = view
  const isCallout = a.type === 'callout'
  const weight = isCallout ? CALLOUT_WEIGHT : TEXT_WEIGHT
  const lines = Math.max(1, a.text.split('\n').length)
  let left: number
  let top: number
  let textW: number
  if (isCallout) {
    const g = calloutGeometry(a, canvasMeasurer)
    left = g.label.x + g.padX
    top = g.label.y + g.padY
    textW = g.label.w - g.padX * 2
  } else {
    left = a.x
    top = a.y
    textW = textSize(a.text || 'Text', a.fontSize, canvasMeasurer).w
  }

  const finish = () => editorStore.getState().finishEditing()

  return (
    <textarea
      ref={ref}
      className={`text-editor ${isCallout ? 'is-callout' : 'is-text'}`}
      aria-label={isCallout ? 'Callout message' : 'Text'}
      placeholder={isCallout ? '' : 'Text'}
      spellCheck={false}
      value={a.text}
      wrap="off"
      style={{
        left: pan.x + left * zoom,
        top: pan.y + top * zoom,
        // Extra room for the next character so the textarea never scrolls.
        width: (textW + a.fontSize) * zoom,
        height: lines * a.fontSize * LINE_HEIGHT * zoom,
        font: `${weight} ${a.fontSize * zoom}px ${FONT_FAMILY}`,
        lineHeight: LINE_HEIGHT,
        color: isCallout ? a.textColor : a.color,
        caretColor: isCallout ? a.textColor : a.color,
        opacity: a.opacity
      }}
      onChange={(e) => editorStore.getState().setEditingText(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          finish()
        }
      }}
    />
  )
}
