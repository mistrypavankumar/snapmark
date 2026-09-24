import { useEffect, useRef, useState } from 'react'
import type { OverlayInit, SelectionRect } from '@shared/ipc'

const api = window.snapmark

/** Drags smaller than this (CSS px) count as a click, which captures the whole display. */
const MIN_SELECTION = 3

/**
 * Full-screen frozen frame of one display. The user drags a region; the main
 * process crops the full-resolution frame, so the JPEG here is only a preview.
 * Pointer handling writes to the DOM directly to stay smooth on 5K displays.
 */
export function Overlay() {
  const [init, setInit] = useState<OverlayInit | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<HTMLDivElement>(null)
  const guideX = useRef<HTMLDivElement>(null)
  const guideY = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    api
      .getOverlayInit()
      .then((data) => {
        objectUrl = URL.createObjectURL(new Blob([data.preview as BlobPart], { type: 'image/jpeg' }))
        setInit(data)
        setUrl(objectUrl)
      })
      .catch(() => api.finishSelection(null))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  useEffect(() => {
    if (!init) return
    const root = rootRef.current!
    const sel = selRef.current!
    const size = sizeRef.current!
    let start: { x: number; y: number } | null = null
    let done = false

    const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): SelectionRect => {
      const x1 = Math.max(0, Math.min(a.x, b.x))
      const y1 = Math.max(0, Math.min(a.y, b.y))
      const x2 = Math.min(init.displayWidth, Math.max(a.x, b.x))
      const y2 = Math.min(init.displayHeight, Math.max(a.y, b.y))
      return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
    }

    const moveGuides = (x: number, y: number) => {
      guideX.current!.style.transform = `translateX(${x}px)`
      guideY.current!.style.transform = `translateY(${y}px)`
    }

    const draw = (r: SelectionRect) => {
      sel.style.transform = `translate(${r.x}px, ${r.y}px)`
      sel.style.width = `${r.width}px`
      sel.style.height = `${r.height}px`
      const pw = Math.round(r.width * init.pixelRatio)
      const ph = Math.round(r.height * init.pixelRatio)
      size.textContent = `${pw} × ${ph}`
      // Keep the readout inside the screen: below the selection, or inside it near the bottom edge.
      const below = r.y + r.height + 30 < init.displayHeight
      size.style.transform = `translate(${Math.min(r.x, init.displayWidth - 120)}px, ${
        below ? r.y + r.height + 8 : Math.max(0, r.y + r.height - 30)
      }px)`
    }

    const finish = (rect: SelectionRect | null) => {
      if (done) return
      done = true
      api.finishSelection(rect)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      start = { x: e.clientX, y: e.clientY }
      root.setPointerCapture(e.pointerId)
      root.classList.add('selecting')
      draw(rectFrom(start, start))
    }
    const onMove = (e: PointerEvent) => {
      moveGuides(e.clientX, e.clientY)
      if (start) draw(rectFrom(start, { x: e.clientX, y: e.clientY }))
    }
    const onUp = (e: PointerEvent) => {
      if (!start) return
      const r = rectFrom(start, { x: e.clientX, y: e.clientY })
      start = null
      if (r.width < MIN_SELECTION && r.height < MIN_SELECTION) {
        // A plain click captures the whole display.
        finish({ x: 0, y: 0, width: init.displayWidth, height: init.displayHeight })
      } else if (r.width >= 1 && r.height >= 1) {
        finish(r)
      } else {
        root.classList.remove('selecting')
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(null)
    }
    const onContext = (e: MouseEvent) => {
      // Right-click cancels, like the system screenshot tool.
      e.preventDefault()
      finish(null)
    }

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
    }
  }, [init])

  return (
    <div ref={rootRef} className="overlay">
      {url && <img className="overlay-frame" src={url} alt="" draggable={false} onLoad={() => api.overlayReady()} />}
      <div className="overlay-dim" />
      <div ref={guideX} className="overlay-guide vertical" />
      <div ref={guideY} className="overlay-guide horizontal" />
      <div ref={selRef} className="overlay-selection" />
      <div ref={sizeRef} className="overlay-size" />
      <div className="overlay-hint">Drag to capture a region · Click for the full screen · Esc to cancel</div>
    </div>
  )
}
