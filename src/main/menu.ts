import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '@shared/ipc'
import { startCapture } from './capture'
import { openImageFileDialog, pasteFromClipboard } from './images'
import { isEditorWindow, showHomeWindow } from './windows'

/**
 * Editor commands go through the menu (not renderer keydown handlers) so each
 * shortcut fires exactly once. The renderer decides whether a command applies
 * to the canvas or to a focused text field.
 */
function editorCommand(cmd: MenuCommand, fallback?: (win: BrowserWindow) => void) {
  return (_item: Electron.MenuItem, base: Electron.BaseWindow | undefined) => {
    const win = base instanceof BrowserWindow ? base : BrowserWindow.getFocusedWindow()
    if (isEditorWindow(win)) win.webContents.send(IPC.menuCommand, cmd)
    else if (win && fallback) fallback(win)
  }
}

export function buildMenu(captureShortcut: string) {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Capture Region',
          accelerator: captureShortcut,
          // The global shortcut already handles this key; display only.
          registerAccelerator: false,
          click: () => void startCapture()
        },
        {
          label: 'Open Image…',
          accelerator: 'CmdOrCtrl+O',
          click: (_i, w) => void openImageFileDialog(w instanceof BrowserWindow ? w : null)
        },
        {
          label: 'New from Clipboard',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            const r = await pasteFromClipboard()
            if (!r.ok) showHomeWindow().webContents.send(IPC.notice, r.message)
          }
        },
        { type: 'separator' },
        { label: 'Save as PNG…', accelerator: 'CmdOrCtrl+S', click: editorCommand('save') },
        { label: 'Copy Image', accelerator: 'CmdOrCtrl+Shift+C', click: editorCommand('copy') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: editorCommand('undo', (w) => w.webContents.undo()) },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: editorCommand('redo', (w) => w.webContents.redo())
        },
        { type: 'separator' },
        { role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: editorCommand('copy', (w) => w.webContents.copy()) },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Arrange',
      submenu: [
        { label: 'Bring Forward', accelerator: 'CmdOrCtrl+]', click: editorCommand('bring-forward') },
        { label: 'Send Backward', accelerator: 'CmdOrCtrl+[', click: editorCommand('send-backward') },
        { label: 'Bring to Front', accelerator: 'CmdOrCtrl+Shift+]', click: editorCommand('bring-to-front') },
        { label: 'Send to Back', accelerator: 'CmdOrCtrl+Shift+[', click: editorCommand('send-to-back') },
        { type: 'separator' },
        { label: 'Delete Annotation', click: editorCommand('delete') },
        { label: 'Clear All Annotations', accelerator: 'CmdOrCtrl+Shift+Backspace', click: editorCommand('clear') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: editorCommand('zoom-in') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', visible: false, click: editorCommand('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: editorCommand('zoom-out') },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', click: editorCommand('zoom-fit') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+1', click: editorCommand('zoom-actual') },
        ...(process.env['ELECTRON_RENDERER_URL']
          ? ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: 'Snapmark Home', click: () => showHomeWindow() },
        { role: 'front' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
