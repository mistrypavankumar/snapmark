import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  type Display,
  type NativeImage
} from 'electron'
import type { PermissionStatus, SelectionRect } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import { physicalSize, screenshotName, selectionToPixels } from './captureMath'
import { createEditorWindow, createOverlayWindow, showHomeWindow } from './windows'

interface OverlayEntry {
  win: BrowserWindow
  display: Display
  frame: NativeImage
  ready: boolean
}

interface CaptureSession {
  overlays: OverlayEntry[]
  hiddenWindows: BrowserWindow[]
  shown: boolean
  finished: boolean
}

let session: CaptureSession | null = null

export function getScreenPermission(): PermissionStatus {
  if (process.platform !== 'darwin') return 'granted'
  try {
    return systemPreferences.getMediaAccessStatus('screen') as PermissionStatus
  } catch {
    return 'unknown'
  }
}

export function openScreenRecordingSettings() {
  void shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
}

function showPermissionHelp() {
  const home = showHomeWindow()
  const send = () => home.webContents.send(IPC.showPermissionHelp)
  if (home.webContents.isLoading()) home.webContents.once('did-finish-load', send)
  else send()
}

function notify(message: string) {
  const home = showHomeWindow()
  const send = () => home.webContents.send(IPC.notice, message)
  if (home.webContents.isLoading()) home.webContents.once('did-finish-load', send)
  else send()
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Grabs a full-resolution frame of every display. Displays are grouped by
 * physical size because `thumbnailSize` applies to every source in a call;
 * requesting each display's exact pixel size keeps Retina frames 1:1.
 */
async function captureAllDisplays(): Promise<Array<{ display: Display; frame: NativeImage }>> {
  const displays = screen.getAllDisplays()
  const groups = new Map<string, Display[]>()
  for (const d of displays) {
    const size = physicalSize(d.bounds, d.scaleFactor)
    const key = `${size.width}x${size.height}`
    groups.set(key, [...(groups.get(key) ?? []), d])
  }

  const results: Array<{ display: Display; frame: NativeImage }> = []
  for (const group of groups.values()) {
    const size = physicalSize(group[0].bounds, group[0].scaleFactor)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: size,
      fetchWindowIcons: false
    })
    for (const display of group) {
      const source =
        sources.find((s) => s.display_id === String(display.id)) ??
        // Some configurations report an empty display_id; fall back to order.
        sources[displays.indexOf(display)] ??
        sources[0]
      if (source && !source.thumbnail.isEmpty()) {
        results.push({ display, frame: source.thumbnail })
      }
    }
  }
  return results
}

let requestedThisSession = false

/**
 * macOS reports "denied" until the app has asked at least once, and only a
 * real capture request shows the system prompt and adds Snapmark to the
 * Screen Recording list. So ask once per launch before giving up.
 */
async function ensureScreenPermission(): Promise<boolean> {
  const status = getScreenPermission()
  if (status === 'granted' || status === 'unknown') return true
  if (status === 'restricted' || requestedThisSession) return false
  requestedThisSession = true
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
  } catch {
    // The status check below decides.
  }
  return getScreenPermission() === 'granted'
}

/**
 * Test hook for development builds only: SNAPMARK_FAKE_CAPTURE=<image> makes
 * the primary display "show" that image, so the overlay and crop path can be
 * exercised without Screen Recording permission. Ignored when packaged.
 */
function fakeFrames(): Array<{ display: Display; frame: NativeImage }> | null {
  const path = app.isPackaged ? undefined : process.env['SNAPMARK_FAKE_CAPTURE']
  if (!path) return null
  const display = screen.getPrimaryDisplay()
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return null
  return [{ display, frame: img.resize(physicalSize(display.bounds, display.scaleFactor)) }]
}

function hideAppWindows(): BrowserWindow[] {
  const hidden = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !w.isDestroyed())
  for (const w of hidden) w.hide()
  return hidden
}

function restoreWindows(windows: BrowserWindow[]) {
  for (const w of windows) if (!w.isDestroyed()) w.showInactive()
}

export function isCapturing() {
  return session !== null
}

export async function startCapture(): Promise<void> {
  if (session) {
    session.overlays[0]?.win.focus()
    return
  }

  const fake = fakeFrames()
  if (!fake && !(await ensureScreenPermission())) {
    showPermissionHelp()
    return
  }

  const hiddenWindows = hideAppWindows()
  // Let the window server finish hiding our windows before grabbing frames.
  if (hiddenWindows.length > 0) await delay(220)

  let frames: Array<{ display: Display; frame: NativeImage }>
  try {
    frames = fake ?? (await captureAllDisplays())
  } catch (err) {
    restoreWindows(hiddenWindows)
    if (getScreenPermission() !== 'granted') showPermissionHelp()
    else notify(`Screen capture failed: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // On first use macOS shows its own prompt and the frames contain only the
  // desktop wallpaper until the user grants access and relaunches the app.
  if (frames.length === 0 || (!fake && getScreenPermission() !== 'granted')) {
    restoreWindows(hiddenWindows)
    showPermissionHelp()
    return
  }

  const current: CaptureSession = { overlays: [], hiddenWindows, shown: false, finished: false }
  session = current
  // Escape must cancel even if an overlay hasn't received focus yet.
  globalShortcut.register('Escape', () => finishSelection(null, null))

  for (const { display, frame } of frames) {
    const pixelRatio = frame.getSize().width / display.bounds.width
    const win = createOverlayWindow(display.bounds, {
      preview: frame.toJPEG(88),
      pixelRatio,
      displayWidth: display.bounds.width,
      displayHeight: display.bounds.height
    })
    current.overlays.push({ win, display, frame, ready: false })
  }

  // Safety net: show whatever is ready if a renderer is slow.
  setTimeout(() => showOverlays(current), 2500)
}

export function overlayReady(webContentsId: number) {
  if (!session) return
  const entry = session.overlays.find((o) => o.win.webContents.id === webContentsId)
  if (entry) entry.ready = true
  if (session.overlays.every((o) => o.ready)) showOverlays(session)
}

function showOverlays(s: CaptureSession) {
  if (s.shown || s.finished || session !== s) return
  s.shown = true
  const cursor = screen.getCursorScreenPoint()
  let focusTarget: BrowserWindow | null = null
  for (const o of s.overlays) {
    if (o.win.isDestroyed()) continue
    o.win.setBounds(o.display.bounds)
    o.win.showInactive()
    // Re-apply after showing: macOS may constrain a window below the menu bar.
    o.win.setBounds(o.display.bounds)
    const b = o.display.bounds
    if (cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height) {
      focusTarget = o.win
    }
  }
  // The shortcut fires while another app is active; take focus so the
  // overlay receives keyboard and mouse input immediately.
  if (process.platform === 'darwin') app.focus({ steal: true })
  ;(focusTarget ?? s.overlays[0]?.win)?.focus()
}

/**
 * Called by an overlay with a selection (or null to cancel). Crops the
 * full-resolution frame for that display and opens the editor.
 */
export function finishSelection(webContentsId: number | null, rect: SelectionRect | null) {
  const s = session
  if (!s || s.finished) return
  s.finished = true
  session = null
  globalShortcut.unregister('Escape')

  const entry =
    webContentsId === null ? undefined : s.overlays.find((o) => o.win.webContents.id === webContentsId)

  let result: { png: Buffer; width: number; height: number } | null = null
  if (entry && rect) {
    const frameSize = entry.frame.getSize()
    const crop = selectionToPixels(rect, entry.display.bounds, frameSize)
    if (crop) {
      result = { png: entry.frame.crop(crop).toPNG(), width: crop.width, height: crop.height }
    }
  }

  for (const o of s.overlays) if (!o.win.isDestroyed()) o.win.destroy()
  restoreWindows(s.hiddenWindows)

  if (result) {
    createEditorWindow(
      { bytes: new Uint8Array(result.png), mime: 'image/png', name: screenshotName() },
      { width: result.width, height: result.height }
    )
  }
}
