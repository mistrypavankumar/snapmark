import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type EditorImage, type OverlayInit } from '@shared/ipc'
import {
  finishSelection,
  getScreenPermission,
  openScreenRecordingSettings,
  overlayReady,
  startCapture
} from './capture'
import { isValidSelection } from './captureMath'
import { copyImage, openImageBytes, openImageFileDialog, pasteFromClipboard, saveImage } from './images'
import { editorImages, isTrustedSender, overlayInits, setDirty } from './windows'

type AnyEvent = IpcMainEvent | IpcMainInvokeEvent

function assertTrusted(e: AnyEvent) {
  if (!isTrustedSender(e.senderFrame?.url)) {
    throw new Error('Blocked IPC from an untrusted frame')
  }
}

function handle<A extends unknown[], R>(
  channel: string,
  fn: (e: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
) {
  ipcMain.handle(channel, (e, ...args) => {
    assertTrusted(e)
    return fn(e, ...(args as A))
  })
}

function on<A extends unknown[]>(channel: string, fn: (e: IpcMainEvent, ...args: A) => void) {
  ipcMain.on(channel, (e, ...args) => {
    if (!isTrustedSender(e.senderFrame?.url)) return
    fn(e, ...(args as A))
  })
}

export function registerIpc(getAppInfo: () => AppInfo) {
  handle(IPC.getAppInfo, () => getAppInfo())
  handle(IPC.startCapture, () => startCapture())
  handle(IPC.openImageFile, (e) => openImageFileDialog(BrowserWindow.fromWebContents(e.sender)))
  handle(IPC.openImageBytes, (_e, bytes: unknown, name: unknown) => openImageBytes(bytes, name))
  handle(IPC.pasteFromClipboard, () => pasteFromClipboard())
  handle(IPC.getPermissionStatus, () => getScreenPermission())
  handle(IPC.openScreenRecordingSettings, () => openScreenRecordingSettings())
  handle(IPC.relaunch, () => {
    app.relaunch()
    app.exit(0)
  })

  handle(IPC.getOverlayInit, (e): OverlayInit => {
    const init = overlayInits.get(e.sender.id)
    if (!init) throw new Error('No capture in progress for this window')
    return init
  })
  on(IPC.overlayReady, (e) => overlayReady(e.sender.id))
  on(IPC.finishSelection, (e, rect: unknown) => {
    finishSelection(e.sender.id, isValidSelection(rect) ? rect : null)
  })

  handle(IPC.getEditorImage, (e): EditorImage => {
    const img = editorImages.get(e.sender.id)
    if (!img) throw new Error('No image for this window')
    return img
  })
  handle(IPC.saveImage, (e, png: unknown, name: unknown) =>
    saveImage(BrowserWindow.fromWebContents(e.sender), png, name)
  )
  handle(IPC.copyImage, (_e, png: unknown) => copyImage(png))
  on(IPC.setDirty, (e, dirty: unknown) => setDirty(e.sender.id, dirty === true))
}
