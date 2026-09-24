import Konva from 'konva'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Rect, Stage } from 'react-konva'
import { useStore } from 'zustand'
import { newId } from '../lib/doc'
import {
  bakeTransform,
  calloutGeometry,
  dist,
  dragMove,
  fitView,
  isMeaningful,
  normalizeRect,
  readableTextColor,
  snapAngle,
  squareFrom,
  zoomAt
} from '../lib/geometry'
import { canvasMeasurer } from '../lib/text'
import type { Annotation, AnnotationType, Point } from '../lib/types'
import { AnnotationNode, type NodeHandlers } from './AnnotationNode'
import { SelectionLayer } from './SelectionLayer'
import { draftStore, editorStore, previewStore, useEditor } from './store'
import { TextEditor } from './TextEditor'

/** Lets the export code reach the live content layer without prop drilling. */
export const canvasRefs: { content: Konva.Layer | null; stage: Konva.Stage | null } = {
  content: null,
  stage: null
}

const HIT_SLOP_CSS = 6
const DRAG_THRESHOLD_CSS = 4

type Gesture =
  | { kind: 'pan'; startClient: Point; startPan: Point; moved: boolean }
  | { kind: 'draw'; tool: AnnotationType; start: Point; id: string }

function isSelectionUi(node: Konva.Node | null): boolean {
  for (let n: Konva.Node | null = node; n; n = n.getParent()) {
    if (n.hasName('selection-ui') || n instanceof Konva.Transformer) return true
  }
  return false
}

const isBackground = (node: Konva.Node) => node instanceof Konva.Stage || node.hasName('background')

function annotationFromNode(node: Konva.Node): Annotation | undefined {
  if (!node.hasName('annotation')) return undefined
  return editorStore.getState().history.present.find((a) => a.id === node.id())
}

function buildDraft(g: Extract<Gesture, { kind: 'draw' }>, p: Point, shift: boolean, prev: Annotation | null): Annotation | null {
  const s = editorStore.getState()
  const style = s.styles[g.tool]
  const zoom = s.view.zoom
  const base = { id: g.id, color: style.color, strokeWidth: style.strokeWidth, opacity: style.opacity }
  switch (g.tool) {
    case 'arrow':
    case 'line': {
      const end = shift ? snapAngle(g.start, p) : p
      return { ...base, type: g.tool, x1: g.start.x, y1: g.start.y, x2: end.x, y2: end.y }
    }
    case 'rect':
    case 'ellipse': {
      const r = normalizeRect(g.start, shift ? squareFrom(g.start, p) : p)
      return { ...base, type: g.tool, ...r, fill: style.fill }
    }
    case 'pen':
    case 'highlight': {
      if (shift) {
        // Shift draws a straight stroke (handy for highlighting a line of text).
        return { ...base, type: g.tool, points: [g.start.x, g.start.y, p.x, p.y] }
      }
      const pts = prev && prev.type === g.tool ? prev.points : [g.start.x, g.start.y]
      const lx = pts[pts.length - 2]
      const ly = pts[pts.length - 1]
      if (prev && Math.hypot(p.x - lx, p.y - ly) < 1.5 / zoom) return prev
      return { ...base, type: g.tool, points: [...pts, p.x, p.y] }
    }
    case 'callout': {
      const draft = {
        ...base,
        type: 'callout' as const,
        x: 0,
        y: 0,
        tipX: g.start.x,
        tipY: g.start.y,
        text: 'Message',
        fontSize: style.fontSize,
        padding: style.padding,
        textColor: readableTextColor(style.color)
      }
      const { label } = calloutGeometry(draft, canvasMeasurer)
      if (dist(p, g.start) * zoom < DRAG_THRESHOLD_CSS) {
        // Plain click: place the label up and to the right of the tip.
        draft.x = g.start.x + style.fontSize * 1.2
        draft.y = g.start.y - label.h - style.fontSize * 1.6
      } else {
        // Press on the target, drag to where the label should sit.
        draft.x = p.x - label.w / 2
        draft.y = p.y - label.h / 2
      }
      return draft
    }
    default:
      return null
  }
}

function useNodeHandlers(): NodeHandlers {
  return useMemo<NodeHandlers>(
    () => ({
      onPointerDown: (_e, a) => {
        const s = editorStore.getState()
        if (s.tool === 'select') s.select(a.id)
      },
      onDblClick: (a) => {
        if (a.type === 'text' || a.type === 'callout') editorStore.getState().startEditing(a, false)
      },
      onDragStart: (_e, a) => {
        const s = editorStore.getState()
        s.select(a.id)
        s.setDragging(true)
      },
      onDragEnd: (e, a) => {
        const node = e.target
        let dx: number
        let dy: number
        if (!('x' in a)) {
          // Point-based nodes live at the origin; the drag offset is the move.
          dx = node.x()
          dy = node.y()
          node.position({ x: 0, y: 0 })
        } else if (a.type === 'ellipse') {
          dx = node.x() - (a.x + a.w / 2)
          dy = node.y() - (a.y + a.h / 2)
        } else {
          dx = node.x() - a.x
          dy = node.y() - a.y
        }
        const s = editorStore.getState()
        s.setDragging(false)
        if (dx !== 0 || dy !== 0) s.update(dragMove(a, dx, dy))
      },
      onTransformEnd: (e, a) => {
        const node = e.target
        const t = { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY() }
        // react-konva won't reset attrs we never pass as props, so do it here.
        node.scale({ x: 1, y: 1 })
        if (a.type === 'pen' || a.type === 'highlight') node.position({ x: 0, y: 0 })
        editorStore.getState().update(bakeTransform(a, t))
      }
    }),
    []
  )
}

function DraftNode({ hitSlop }: { hitSlop: number }) {
  const draft = useStore(draftStore, (s) => s.draft)
  if (!draft || draft.type === 'callout') return null
  return <AnnotationNode a={draft} draggable={false} listening={false} hitSlop={hitSlop} />
}

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const contentRef = useRef<Konva.Layer>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const image = useEditor((s) => s.image)!
  const view = useEditor((s) => s.view)
  const fitMode = useEditor((s) => s.fitMode)
  const tool = useEditor((s) => s.tool)
  const annotations = useEditor((s) => s.history.present)
  const editing = useEditor((s) => s.editing)
  const preview = useStore(previewStore, (s) => s.preview)
  // Only callout drafts render here; other drafts live in <DraftNode> so a
  // pen stroke doesn't re-render this component on every pointer move.
  const calloutDraft = useStore(draftStore, (s) => (s.draft?.type === 'callout' ? s.draft : null))
  const handlers = useNodeHandlers()

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the image fitted while in fit mode (window resizes, first load).
  useEffect(() => {
    if (fitMode && size.w > 0 && size.h > 0) {
      editorStore
        .getState()
        .setView(fitView(size.w, size.h, image.width, image.height, window.devicePixelRatio || 1), true)
    }
  }, [fitMode, size, image])

  // Callback refs: the Stage only mounts once the container has a size.
  const setStage = useCallback((node: Konva.Stage | null) => {
    stageRef.current = node
    canvasRefs.stage = node
  }, [])
  const setContent = useCallback((node: Konva.Layer | null) => {
    contentRef.current = node
    canvasRefs.content = node
  }, [])

  // Space-bar panning.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault()
        if (!spaceDown.current) {
          spaceDown.current = true
          containerRef.current?.classList.add('panning')
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        containerRef.current?.classList.remove('panning')
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const rendered = useMemo(() => {
    let list: Annotation[] = annotations
    if (preview) list = list.map((a) => (a.id === preview.id ? preview : a))
    if (editing) {
      list = editing.isNew
        ? [...list, editing.annotation]
        : list.map((a) => (a.id === editing.annotation.id ? editing.annotation : a))
    }
    // The callout draft renders in the content layer so it matches the final result exactly.
    if (calloutDraft) list = [...list, calloutDraft]
    return list
  }, [annotations, preview, editing, calloutDraft])

  const pointerImagePos = (evt: PointerEvent): Point => {
    const stage = stageRef.current!
    stage.setPointersPositions(evt)
    return stage.getRelativePointerPosition() ?? { x: 0, y: 0 }
  }

  const endGesture = () => {
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('pointercancel', onWindowUp)
    containerRef.current?.classList.remove('grabbing')
  }

  function onWindowMove(evt: PointerEvent) {
    const g = gesture.current
    const stage = stageRef.current
    if (!g || !stage) return
    if (g.kind === 'pan') {
      const pan = {
        x: g.startPan.x + evt.clientX - g.startClient.x,
        y: g.startPan.y + evt.clientY - g.startClient.y
      }
      g.moved = true
      // Imperative: the stage moves without a React render; committed on release.
      stage.position(pan)
      stage.batchDraw()
      return
    }
    const p = pointerImagePos(evt)
    draftStore.setState((s) => ({ draft: buildDraft(g, p, evt.shiftKey, s.draft) }))
  }

  function onWindowUp(evt: PointerEvent) {
    const g = gesture.current
    gesture.current = null
    endGesture()
    const s = editorStore.getState()
    if (!g) return
    if (g.kind === 'pan') {
      const stage = stageRef.current
      if (stage && g.moved) s.setView({ zoom: s.view.zoom, pan: stage.position() })
      return
    }
    const p = pointerImagePos(evt)
    const final = buildDraft(g, p, evt.shiftKey, draftStore.getState().draft)
    draftStore.setState({ draft: null })
    if (!final) return
    if (final.type === 'callout') {
      s.startEditing(final, true)
    } else if (isMeaningful(final, 3 / s.view.zoom)) {
      s.add(final)
    }
  }

  const startGesture = (g: Gesture) => {
    gesture.current = g
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
  }

  const onStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current
    if (!stage || gesture.current) return
    const evt = e.evt
    const target = e.target
    if (isSelectionUi(target)) return
    const s = editorStore.getState()

    // Clicking outside an active text edit just finishes it.
    if (s.editing) {
      s.finishEditing()
      return
    }

    const wantsPan = evt.button === 1 || spaceDown.current || (s.tool === 'select' && isBackground(target))
    if (wantsPan) {
      if (s.tool === 'select' && isBackground(target)) s.select(null)
      containerRef.current?.classList.add('grabbing')
      startGesture({ kind: 'pan', startClient: { x: evt.clientX, y: evt.clientY }, startPan: stage.position(), moved: false })
      return
    }
    if (evt.button !== 0 || s.tool === 'select') return

    const p = stage.getRelativePointerPosition()
    if (!p) return

    // With the text or callout tool, clicking an existing one edits it.
    const hit = annotationFromNode(target)
    if (hit && (s.tool === 'text' || s.tool === 'callout') && hit.type === s.tool) {
      s.startEditing(hit, false)
      return
    }

    s.select(null)
    if (s.tool === 'text') {
      const style = s.styles.text
      s.startEditing(
        {
          id: newId(),
          type: 'text',
          x: p.x,
          y: p.y - style.fontSize * 0.6,
          text: '',
          fontSize: style.fontSize,
          color: style.color,
          strokeWidth: style.strokeWidth,
          opacity: style.opacity
        },
        true
      )
      return
    }
    const g: Gesture = { kind: 'draw', tool: s.tool, start: p, id: newId() }
    startGesture(g)
    draftStore.setState({ draft: buildDraft(g, p, evt.shiftKey, null) })
  }

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const s = editorStore.getState()
    const evt = e.evt
    if (evt.ctrlKey || evt.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel.
      const anchor = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 }
      s.setView(zoomAt(s.view, s.view.zoom * Math.exp(-evt.deltaY * 0.01), anchor))
    } else {
      s.setView({ zoom: s.view.zoom, pan: { x: s.view.pan.x - evt.deltaX, y: s.view.pan.y - evt.deltaY } })
    }
  }

  const onMouseOver = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const c = containerRef.current
    if (!c) return
    const onAnnotation = e.target.hasName('annotation')
    c.classList.toggle('over-annotation', onAnnotation && editorStore.getState().tool === 'select')
  }

  const hitSlop = HIT_SLOP_CSS / view.zoom
  const dpr = window.devicePixelRatio || 1

  return (
    <div ref={containerRef} className={`canvas-wrap tool-${tool}`} data-testid="canvas">
      {size.w > 0 && (
        <Stage
          ref={setStage}
          width={size.w}
          height={size.h}
          x={view.pan.x}
          y={view.pan.y}
          scaleX={view.zoom}
          scaleY={view.zoom}
          onPointerDown={onStagePointerDown}
          onWheel={onWheel}
          onMouseOver={onMouseOver}
        >
          <Layer listening={false}>
            <Rect
              width={image.width}
              height={image.height}
              fill="#000"
              shadowColor="#000"
              shadowBlur={28 / view.zoom}
              shadowOffsetY={6 / view.zoom}
              shadowOpacity={0.45}
            />
          </Layer>
          {/* Everything in this layer is exported; nothing else is. */}
          <Layer ref={setContent} imageSmoothingEnabled={view.zoom * dpr < 2}>
            <KonvaImage image={image.el} width={image.width} height={image.height} name="background" />
            {rendered.map((a) => (
              <AnnotationNode
                key={a.id}
                a={a}
                draggable={tool === 'select' && !editing}
                listening={calloutDraft?.id !== a.id}
                hitSlop={hitSlop}
                hideText={editing?.annotation.id === a.id}
                {...handlers}
              />
            ))}
          </Layer>
          <Layer>
            <DraftNode hitSlop={hitSlop} />
            <SelectionLayer stageRef={stageRef} />
          </Layer>
        </Stage>
      )}
      <TextEditor />
    </div>
  )
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}
