import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuCommand } from '@shared/ipc'
import { exportBounds, fitView, stepZoom, zoomAt } from '../lib/geometry'
import { canvasMeasurer } from '../lib/text'
import type { Tool } from '../lib/types'
import { CanvasView, canvasRefs, isTyping } from './CanvasView'
import { renderPng } from './exportImage'
import { Icons } from './icons'
import { editorStore, selectDirty, useEditor } from './store'
import { Inspector, TOOLS, Toolbar } from './Toolbar'
import { Toast } from '../views/Toast'

const api = window.snapmark

async function loadImage(bytes: Uint8Array, mime: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } finally {
    // The decoded image stays usable after revoking its URL.
    URL.revokeObjectURL(url)
  }
  return img
}

function viewport() {
  const s = canvasRefs.stage
  return { w: s?.width() ?? window.innerWidth, h: s?.height() ?? window.innerHeight }
}

function zoomBy(dir: 1 | -1) {
  const s = editorStore.getState()
  const { w, h } = viewport()
  s.setView(zoomAt(s.view, stepZoom(s.view.zoom, window.devicePixelRatio || 1, dir), { x: w / 2, y: h / 2 }))
}

function zoomFit() {
  const s = editorStore.getState()
  if (!s.image) return
  const { w, h } = viewport()
  s.setView(fitView(w, h, s.image.width, s.image.height, window.devicePixelRatio || 1), true)
}

function zoomActual() {
  const s = editorStore.getState()
  const { w, h } = viewport()
  s.setView(zoomAt(s.view, 1 / (window.devicePixelRatio || 1), { x: w / 2, y: h / 2 }))
}

export function Editor() {
  const image = useEditor((s) => s.image)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    api
      .getEditorImage()
      .then(async (data) => {
        const el = await loadImage(data.bytes, data.mime)
        if (cancelled) return
        editorStore.getState().init({ el, width: el.naturalWidth, height: el.naturalHeight, name: data.name })
        document.title = data.name
      })
      .catch((err: unknown) => setError(`Couldn’t open this image: ${(err as Error).message}`))
    return () => {
      cancelled = true
    }
  }, [])

  // Tell the main process about unsaved changes (for the close prompt).
  useEffect(() => {
    let last = false
    return editorStore.subscribe((s) => {
      const dirty = selectDirty(s)
      if (dirty !== last) {
        last = dirty
        api.setDirty(dirty)
      }
    })
  }, [])

  const exportPng = useCallback(async (): Promise<Uint8Array> => {
    const s = editorStore.getState()
    s.finishEditing()
    s.select(null)
    const layer = canvasRefs.content
    if (!layer || !s.image) throw new Error('the canvas isn’t ready yet')
    return renderPng(layer, exportBounds(s.image.width, s.image.height, s.history.present, canvasMeasurer))
  }, [])

  const run = useCallback(
    async (action: (png: Uint8Array) => Promise<{ ok: boolean; canceled?: boolean; message?: string }>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const s = editorStore.getState()
      try {
        const png = await exportPng()
        const res = await action(png)
        if (res.ok) {
          s.markSaved()
          if (res.message) s.notify(res.message, 'success')
        } else if (!res.canceled && res.message) {
          s.notify(res.message, 'error')
        }
      } catch (err) {
        s.notify(`Export failed: ${(err as Error).message}`, 'error')
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [exportPng]
  )

  const save = useCallback(() => run((png) => api.saveImage(png, editorStore.getState().image?.name ?? 'Screenshot')), [run])
  const copy = useCallback(() => run((png) => api.copyImage(png)), [run])

  // Menu-driven commands (each shortcut is owned by exactly one menu item).
  useEffect(() => {
    return api.onMenuCommand((cmd: MenuCommand) => {
      const s = editorStore.getState()
      const typing = isTyping(document.activeElement)
      switch (cmd) {
        case 'undo':
          if (typing) document.execCommand('undo')
          else s.undo()
          break
        case 'redo':
          if (typing) document.execCommand('redo')
          else s.redo()
          break
        case 'copy':
          if (typing) document.execCommand('copy')
          else void copy()
          break
        case 'save':
          void save()
          break
        case 'zoom-in':
          zoomBy(1)
          break
        case 'zoom-out':
          zoomBy(-1)
          break
        case 'zoom-fit':
          zoomFit()
          break
        case 'zoom-actual':
          zoomActual()
          break
        case 'delete':
          s.removeSelected()
          break
        case 'clear':
          s.clear()
          break
        case 'bring-forward':
          s.reorderSelected('forward')
          break
        case 'send-backward':
          s.reorderSelected('backward')
          break
        case 'bring-to-front':
          s.reorderSelected('front')
          break
        case 'send-to-back':
          s.reorderSelected('back')
          break
      }
    })
  }, [copy, save])

  // Single-key shortcuts that have no menu item.
  useEffect(() => {
    const byKey = new Map<string, Tool>(TOOLS.map((t) => [t.key.toLowerCase(), t.id]))
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = editorStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicateSelected()
        return
      }
      if (mod || e.altKey) return
      const tool = byKey.get(e.key.toLowerCase())
      if (tool) {
        s.setTool(tool)
        return
      }
      switch (e.key) {
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          s.removeSelected()
          break
        case 'Escape':
          if (s.selectedId) s.select(null)
          else if (s.tool !== 'select') s.setTool('select')
          break
        case 'Enter': {
          const a = s.history.present.find((x) => x.id === s.selectedId)
          if (a && (a.type === 'text' || a.type === 'callout')) {
            e.preventDefault()
            s.startEditing(a, false)
          }
          break
        }
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!s.selectedId) break
          e.preventDefault()
          // Nudge by one screen pixel (ten with Shift), whatever the zoom.
          const step = (e.shiftKey ? 10 : 1) / s.view.zoom
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          s.nudgeSelected(dx, dy)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Dropping or pasting an image opens it in a new editor window.
  useEffect(() => {
    const openFile = async (file: File) => {
      const res = await api.openImageBytes(new Uint8Array(await file.arrayBuffer()), file.name)
      if (!res.ok && res.message) editorStore.getState().notify(res.message, 'error')
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) void openFile(file)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        void openFile(file)
        editorStore.getState().notify('Opened the pasted image in a new window')
      }
    }
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  if (error) {
    return (
      <div className="center-message" role="alert">
        {error}
      </div>
    )
  }
  if (!image) return <div className="center-message">Loading…</div>

  return (
    <div className="editor">
      <Toolbar onSave={save} onCopy={copy} busy={busy} />
      <Inspector />
      <main className="stage-area">
        <CanvasView />
      </main>
      <StatusBar />
      <Toast />
    </div>
  )
}

function StatusBar() {
  const image = useEditor((s) => s.image)!
  const zoom = useEditor((s) => s.view.zoom)
  const annotations = useEditor((s) => s.history.present)
  const count = annotations.length
  const out = useMemo(() => exportBounds(image.width, image.height, annotations, canvasMeasurer), [image, annotations])
  const grown = out.w !== image.width || out.h !== image.height
  const dpr = window.devicePixelRatio || 1
  return (
    <footer className="statusbar">
      <span>
        {image.width} × {image.height} px
        {grown && (
          <span title="Annotations extend past the image, so the export grows to include them">
            {' '}
            → exports {out.w} × {out.h} px
          </span>
        )}
      </span>
      <span>
        {count} annotation{count === 1 ? '' : 's'}
      </span>
      <div className="spacer" />
      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn small" aria-label="Zoom out" title="Zoom Out (⌘−)" onClick={() => zoomBy(-1)}>
          <Icons.zoomOut />
        </button>
        <button type="button" className="zoom-value" title="Zoom to Fit (⌘0)" onClick={zoomFit}>
          {Math.round(zoom * dpr * 100)}%
        </button>
        <button type="button" className="icon-btn small" aria-label="Zoom in" title="Zoom In (⌘=)" onClick={() => zoomBy(1)}>
          <Icons.zoomIn />
        </button>
      </div>
    </footer>
  )
}
