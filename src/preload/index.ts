import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type MenuCommand, type SelectionRect, type SnapmarkApi } from '@shared/ipc'

/**
 * Narrow, typed bridge. The renderer never gets `ipcRenderer` itself, only
 * these functions, each bound to a single fixed channel.
 */
function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void) {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: SnapmarkApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  startCapture: () => ipcRenderer.invoke(IPC.startCapture),
  openImageFile: () => ipcRenderer.invoke(IPC.openImageFile),
  openImageBytes: (bytes: Uint8Array, name: string) =>
    ipcRenderer.invoke(IPC.openImageBytes, bytes, name),
  pasteFromClipboard: () => ipcRenderer.invoke(IPC.pasteFromClipboard),
  getPermissionStatus: () => ipcRenderer.invoke(IPC.getPermissionStatus),
  openScreenRecordingSettings: () => ipcRenderer.invoke(IPC.openScreenRecordingSettings),
  relaunch: () => ipcRenderer.invoke(IPC.relaunch),

  getOverlayInit: () => ipcRenderer.invoke(IPC.getOverlayInit),
  overlayReady: () => ipcRenderer.send(IPC.overlayReady),
  finishSelection: (rect: SelectionRect | null) => ipcRenderer.send(IPC.finishSelection, rect),

  getEditorImage: () => ipcRenderer.invoke(IPC.getEditorImage),
  saveImage: (png: Uint8Array, suggestedName: string) =>
    ipcRenderer.invoke(IPC.saveImage, png, suggestedName),
  copyImage: (png: Uint8Array) => ipcRenderer.invoke(IPC.copyImage, png),
  setDirty: (dirty: boolean) => ipcRenderer.send(IPC.setDirty, dirty),

  onMenuCommand: (cb: (cmd: MenuCommand) => void) => subscribe(IPC.menuCommand, cb),
  onShowPermissionHelp: (cb: () => void) => subscribe(IPC.showPermissionHelp, cb),
  onNotice: (cb: (message: string) => void) => subscribe(IPC.notice, cb)
}

contextBridge.exposeInMainWorld('snapmark', api)
