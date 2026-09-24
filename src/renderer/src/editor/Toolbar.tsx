import type { ReactNode } from 'react'
import { STYLE_FIELDS, styleOf } from '../lib/geometry'
import type { AnnotationType, FillMode, StyleSettings, Tool } from '../lib/types'
import { Icons } from './icons'
import { editorStore, selectSelected, useEditor } from './store'

export const TOOLS: Array<{ id: Tool; label: string; key: string }> = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'highlight', label: 'Highlighter', key: 'H' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'callout', label: 'Callout', key: 'C' }
]

const SWATCHES = ['#e5372b', '#ff9500', '#ffe14d', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#1c1c1e']

const FILLS: Array<{ id: FillMode; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'tint', label: 'Tint' },
  { id: 'solid', label: 'Solid' }
]

function IconButton(props: {
  label: string
  shortcut?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  const title = props.shortcut ? `${props.label} (${props.shortcut})` : props.label
  return (
    <button
      type="button"
      className={`icon-btn ${props.className ?? ''}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

export function Toolbar(props: { onSave: () => void; onCopy: () => void; busy: boolean }) {
  const tool = useEditor((s) => s.tool)
  const canUndo = useEditor((s) => s.history.past.length > 0)
  const canRedo = useEditor((s) => s.history.future.length > 0)
  const s = editorStore.getState

  return (
    <header className="toolbar drag-region">
      <div className="traffic-light-space" />
      <div className="tool-group no-drag" role="toolbar" aria-label="Annotation tools">
        {TOOLS.map((t) => {
          const Icon = Icons[t.id]
          return (
            <IconButton
              key={t.id}
              label={t.label}
              shortcut={t.key}
              pressed={tool === t.id}
              className="tool-btn"
              onClick={() => s().setTool(t.id)}
            >
              <Icon />
            </IconButton>
          )
        })}
      </div>
      <div className="tool-group no-drag" role="group" aria-label="History">
        <IconButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={() => s().undo()}>
          <Icons.undo />
        </IconButton>
        <IconButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => s().redo()}>
          <Icons.redo />
        </IconButton>
      </div>
      <div className="spacer" />
      <div className="actions no-drag">
        <button type="button" className="btn" onClick={props.onCopy} disabled={props.busy} title="Copy Image (⇧⌘C)">
          <Icons.copy /> <span>Copy</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={props.onSave} disabled={props.busy} title="Save as PNG (⌘S)">
          <Icons.save /> <span>Save</span>
        </button>
      </div>
    </header>
  )
}

/** Context-sensitive style controls for the selected annotation or active tool. */
export function Inspector() {
  const selected = useEditor(selectSelected)
  const tool = useEditor((s) => s.tool)
  const styles = useEditor((s) => s.styles)
  const count = useEditor((s) => s.history.present.length)
  const type: AnnotationType | null = selected?.type ?? (tool === 'select' ? null : tool)
  const s = editorStore.getState

  const style: StyleSettings | null = type
    ? selected
      ? { ...styles[type], ...styleOf(selected) }
      : styles[type]
    : null
  const fields = type ? STYLE_FIELDS[type] : []
  const set = (patch: Partial<StyleSettings>, coalesce = false) => s().setStyle(patch, { coalesce })

  return (
    <div className="inspector" role="toolbar" aria-label="Style">
      {style ? (
        <>
          <div className="field" role="radiogroup" aria-label="Color">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={style.color.toLowerCase() === c}
                aria-label={`Color ${c}`}
                className="swatch"
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
            <label className="swatch custom" title="Custom color">
              <span className="sr-only">Custom color</span>
              <input type="color" value={style.color} onChange={(e) => set({ color: e.target.value }, true)} />
            </label>
          </div>
          {fields.includes('strokeWidth') && (
            <Slider label="Stroke" min={1} max={type === 'highlight' ? 120 : 40} value={style.strokeWidth} onChange={(v) => set({ strokeWidth: v }, true)} />
          )}
          {fields.includes('fontSize') && (
            <Slider label="Size" min={8} max={200} value={style.fontSize} onChange={(v) => set({ fontSize: v }, true)} />
          )}
          {fields.includes('padding') && (
            <Slider label="Padding" min={2} max={80} value={style.padding} onChange={(v) => set({ padding: v }, true)} />
          )}
          {fields.includes('fill') && (
            <div className="field segmented" role="radiogroup" aria-label="Fill">
              <span className="field-label">Fill</span>
              {FILLS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={style.fill === f.id}
                  onClick={() => set({ fill: f.id })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {fields.includes('opacity') && (
            <Slider
              label="Opacity"
              min={10}
              max={100}
              value={Math.round(style.opacity * 100)}
              suffix="%"
              onChange={(v) => set({ opacity: v / 100 }, true)}
            />
          )}
        </>
      ) : (
        <span className="hint">
          {count === 0 ? 'Pick a tool to start annotating.' : 'Select an annotation to edit it. Drag empty space to pan.'}
        </span>
      )}
      <div className="spacer" />
      <div className="field" role="group" aria-label="Arrange">
        <button type="button" className="icon-btn small" aria-label="Bring to front" title="Bring to Front (⇧⌘])" disabled={!selected} onClick={() => s().reorderSelected('front')}>
          <Icons.front />
        </button>
        <button type="button" className="icon-btn small" aria-label="Send to back" title="Send to Back (⇧⌘[)" disabled={!selected} onClick={() => s().reorderSelected('back')}>
          <Icons.back />
        </button>
        <button type="button" className="icon-btn small" aria-label="Delete annotation" title="Delete (⌫)" disabled={!selected} onClick={() => s().removeSelected()}>
          <Icons.trash />
        </button>
        <button type="button" className="btn small ghost" disabled={count === 0} onClick={() => s().clear()} title="Clear All (⇧⌘⌫)">
          Clear all
        </button>
      </div>
    </div>
  )
}

function Slider(props: { label: string; min: number; max: number; value: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="field slider">
      <span className="field-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={Math.round(props.value)}
        onChange={(e) => props.onChange(Number(e.target.value))}
        // A new drag after release starts a new undo step.
        onPointerUp={() => editorStore.getState().endCoalesce()}
        onKeyUp={() => editorStore.getState().endCoalesce()}
      />
      <span className="field-value">
        {Math.round(props.value)}
        {props.suffix ?? ''}
      </span>
    </label>
  )
}
