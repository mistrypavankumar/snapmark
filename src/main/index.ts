import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, session, Tray } from 'electron'
import type { AppInfo } from '@shared/ipc'
import { isCapturing, startCapture } from './capture'
import { imagePathsFromArgv, openImageFileDialog, openImagePath, pasteFromClipboard } from './images'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { showHomeWindow } from './windows'
import { IPC } from '@shared/ipc'

export const CAPTURE_SHORTCUT = 'CommandOrControl+Shift+2'

let tray: Tray | null = null
let shortcutUnavailable = false
const pendingOpenPaths: string[] = []

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.setName('Snapmark')

// Finder "Open With" / drag onto Dock icon; may fire before ready.
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (app.isReady()) void openImagePath(path)
  else pendingOpenPaths.push(path)
})

// Lock down every web contents: no new windows, navigation, or webviews.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(dev && url.startsWith(dev))) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

function resourcePath(file: string) {
  return join(app.getAppPath(), 'resources', file)
}

function createTray() {
  const icon = nativeImage.createFromPath(resourcePath('trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Snapmark')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Capture Region',
      accelerator: CAPTURE_SHORTCUT,
      registerAccelerator: false,
      click: () => void startCapture()
    },
    { label: 'Open Image…', click: () => void openImageFileDialog(null) },
    {
      label: 'New from Clipboard',
      click: async () => {
        const r = await pasteFromClipboard()
        if (!r.ok) showHomeWindow().webContents.send(IPC.notice, r.message)
      }
    },
    { type: 'separator' },
    { label: 'Show Snapmark', click: () => showHomeWindow() },
    { type: 'separator' },
    { label: 'Quit Snapmark', role: 'quit' }
  ])
  tray.setContextMenu(menu)
}

function registerShortcut() {
  const ok = globalShortcut.register(CAPTURE_SHORTCUT, () => {
    if (!isCapturing()) void startCapture()
  })
  shortcutUnavailable = !ok
}

app.whenReady().then(() => {
  // The renderer needs no browser permissions (camera, notifications, etc.).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const appInfo = (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    captureShortcut: CAPTURE_SHORTCUT,
    shortcutUnavailable
  })
  registerIpc(appInfo)
  buildMenu(CAPTURE_SHORTCUT)
  registerShortcut()
  createTray()

  pendingOpenPaths.push(...imagePathsFromArgv(process.argv))
  if (pendingOpenPaths.length) {
    for (const p of pendingOpenPaths.splice(0)) void openImagePath(p)
  } else {
    showHomeWindow()
  }

  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().some((w) => w.isVisible())) showHomeWindow()
  })
})

app.on('second-instance', (_e, argv) => {
  const paths = imagePathsFromArgv(argv)
  if (paths.length === 0) showHomeWindow()
  for (const p of paths) void openImagePath(p)
})

// Stay alive in the menu bar so the global shortcut keeps working.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
})
