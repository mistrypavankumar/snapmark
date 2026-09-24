import type Konva from 'konva'
import { useEffect, useRef } from 'react'
import { Circle, Transformer } from 'react-konva'
import { setLineEndpoint } from '../lib/geometry'
import type { Annotation } from '../lib/types'
import { editorStore, previewStore, selectSelected, useEditor } from './store'

const ACCENT = '#0a84ff'

/** Types resized with Konva's Transformer; lines and callouts use point handles. */
const TRANSFORMABLE = new Set<Annotation['type']>(['rect', 'ellipse', 'pen', 'highlight', 'text'])

export function SelectionLayer({ stageRef }: { stageRef: React.RefObject<Konva.Stage | null> }) {
  const selected = useEditor(selectSelected)
  const zoom = useEditor((s) => s.view.zoom)
  const dragging = useEditor((s) => s.dragging)
  const editing = useEditor((s) => s.editing)
  const trRef = useRef<Konva.Transformer>(null)

  const transformable = selected && TRANSFORMABLE.has(selected.type) && !editing

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = transformable ? stageRef.current?.findOne<Konva.Node>('#' + selected.id) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selected, transformable, stageRef])

  const isText = selected?.type === 'text'
  const r = 6 / zoom

  return (
    <>
      <Transformer
        ref={trRef}
        name="selection-ui"
        rotateEnabled={false}
        flipEnabled={false}
        ignoreStroke
        keepRatio={isText}
        enabledAnchors={
          isText
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            : ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']
        }
        anchorSize={9}
        anchorCornerRadius={2}
        anchorStroke={ACCENT}
        anchorFill="#ffffff"
        borderStroke={ACCENT}
        borderDash={[4, 3]}
        padding={4}
        boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? oldBox : newBox)}
      />
      {selected && !dragging && !editing && (selected.type === 'line' || selected.type === 'arrow') && (
        <>
          <PointHandle
            x={selected.x1}
            y={selected.y1}
            radius={r}
            zoom={zoom}
            onMove={(p, shift) => previewAndCommit(selected, setLineEndpoint(selected, 'start', p, shift), false)}
            onEnd={(p, shift) => previewAndCommit(selected, setLineEndpoint(selected, 'start', p, shift), true)}
          />
          <PointHandle
            x={selected.x2}
            y={selected.y2}
            radius={r}
            zoom={zoom}
            onMove={(p, shift) => previewAndCommit(selected, setLineEndpoint(selected, 'end', p, shift), false)}
            onEnd={(p, shift) => previewAndCommit(selected, setLineEndpoint(selected, 'end', p, shift), true)}
          />
        </>
      )}
      {selected && selected.type === 'callout' && !editing && (
        <PointHandle
            x={selected.tipX}
            y={selected.tipY}
            radius={r}
            zoom={zoom}
            label="Pointer tip"
            onMove={(p) => previewAndCommit(selected, { ...selected, tipX: p.x, tipY: p.y }, false)}
            onEnd={(p) => previewAndCommit(selected, { ...selected, tipX: p.x, tipY: p.y }, true)}
          />
      )}
    </>
  )
}

/**
 * While dragging a handle, only the preview changes (one memoized node
 * re-renders, no history entry); on release, commit once to the document.
 */
function previewAndCommit(_orig: Annotation, next: Annotation, commit: boolean) {
  if (commit) {
    previewStore.setState({ preview: null })
    editorStore.getState().update(next)
  } else {
    previewStore.setState({ preview: next })
  }
}

function PointHandle(props: {
  x: number
  y: number
  radius: number
  zoom: number
  label?: string
  onMove: (p: { x: number; y: number }, shift: boolean) => void
  onEnd: (p: { x: number; y: number }, shift: boolean) => void
}) {
  const { x, y, radius, zoom } = props
  return (
    <Circle
      name="selection-ui"
      x={x}
      y={y}
      radius={radius}
      fill="#ffffff"
      stroke={ACCENT}
      strokeWidth={2 / zoom}
      hitStrokeWidth={10 / zoom}
      draggable
      onMouseEnter={(e) => {
        const c = e.target.getStage()?.container()
        if (c) c.style.cursor = 'crosshair'
      }}
      onMouseLeave={(e) => {
        const c = e.target.getStage()?.container()
        if (c) c.style.cursor = ''
      }}
      onDragMove={(e) => props.onMove(e.target.position(), e.evt.shiftKey)}
      onDragEnd={(e) => {
        const p = e.target.position()
        props.onEnd(p, e.evt.shiftKey)
      }}
    />
  )
}
