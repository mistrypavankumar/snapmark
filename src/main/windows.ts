import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, dialog, screen, type WebPreferences } from 'electron'
import type { EditorImage, OverlayInit } from '@shared/ipc'

export type View = 'home' | 'overlay' | 'editor'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/** Hardened defaults for every window. The renderer has no Node access. */
export function secureWebPreferences(): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
    devTools: isDev
  }
}

const indexHtml = () => join(__dirname, '../renderer/index.html')

/** Only our own bundled pages may use the IPC API. */
export function isTrustedSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) return false
  try {
    const url = new URL(frameUrl)
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev) return url.origin === new URL(dev).origin
    return url.protocol === 'file:' && url.pathname === pathToFileURL(indexHtml()).pathname
  } catch {
    return false
  }
}

export function loadView(win: BrowserWindow, view: View) {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void win.loadURL(`${dev}?view=${view}`)
  else void win.loadFile(indexHtml(), { query: { view } })
}

// ---------------------------------------------------------------------------
// Per-window session data, keyed by webContents id
// ---------------------------------------------------------------------------

export const editorImages = new Map<number, EditorImage>()
export const overlayInits = new Map<number, OverlayInit>()
const dirtyEditors = new Set<number>()

export function setDirty(webContentsId: number, dirty: boolean) {
  if (dirty) dirtyEditors.add(webContentsId)
  else dirtyEditors.delete(webContentsId)
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

let homeWindow: BrowserWindow | null = null
const editorWindows = new Set<BrowserWindow>()

export function getHomeWindow() {
  return homeWindow && !homeWindow.isDestroyed() ? homeWindow : null
}

export function isEditorWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return !!win && editorWindows.has(win)
}

export function showHomeWindow(): BrowserWindow {
  const existing = getHomeWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }
  const win = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 480,
    minHeight: 460,
    show: false,
    title: 'Snapmark',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#15171c',
    webPreferences: secureWebPreferences()
  })
  homeWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    homeWindow = null
  })
  loadView(win, 'home')
  return win
}

export function createEditorWindow(image: EditorImage, pixelSize?: { width: number; height: number }) {
  const cursor = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(cursor).workArea
  // Size the window to show the image at its logical (DIP) size where possible.
  const scale = screen.getDisplayNearestPoint(cursor).scaleFactor || 1
  const imgW = pixelSize ? pixelSize.width / scale : 900
  const imgH = pixelSize ? pixelSize.height / scale : 600
  const width = Math.round(clamp(imgW + 80, 760, area.width * 0.9))
  const height = Math.round(clamp(imgH + 160, 520, area.height * 0.9))

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: image.name,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#15171c',
    webPreferences: secureWebPreferences()
  })
  const id = win.webContents.id
  editorImages.set(id, image)
  editorWindows.add(win)

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  win.on('close', (e) => {
    if (!dirtyEditors.has(id)) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Close without saving?',
      detail: 'Your annotations haven’t been saved or copied. They’ll be lost if you close this window.'
    })
    if (choice === 1) e.preventDefault()
  })
  win.on('closed', () => {
    editorImages.delete(id)
    dirtyEditors.delete(id)
    editorWindows.delete(win)
  })
  loadView(win, 'editor')
  return win
}

export function createOverlayWindow(bounds: Electron.Rectangle, init: OverlayInit) {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    hasShadow: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    roundedCorners: false,
    // A panel can float above full-screen apps and other Spaces' windows.
    type: 'panel',
    alwaysOnTop: true,
    webPreferences: secureWebPreferences()
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const id = win.webContents.id
  overlayInits.set(id, init)
  win.on('closed', () => overlayInits.delete(id))
  loadView(win, 'overlay')
  return win
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}
