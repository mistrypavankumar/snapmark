/**
 * The complete IPC contract between the renderer and the main process.
 * The preload script exposes exactly these operations — nothing else.
 */

export const IPC = {
  // Home / launcher
  startCapture: 'capture:start',
  openImageFile: 'image:open-file',
  openImageBytes: 'image:open-bytes',
  pasteFromClipboard: 'image:paste',
  getAppInfo: 'app:info',
  getPermissionStatus: 'permission:status',
  openScreenRecordingSettings: 'permission:open-settings',
  relaunch: 'app:relaunch',
  // Capture overlay
  getOverlayInit: 'overlay:init',
  overlayReady: 'overlay:ready',
  finishSelection: 'overlay:finish',
  // Editor
  getEditorImage: 'editor:image',
  saveImage: 'editor:save',
  copyImage: 'editor:copy',
  setDirty: 'editor:dirty',
  // Main → renderer events
  menuCommand: 'menu:command',
  showPermissionHelp: 'permission:show-help',
  notice: 'app:notice'
} as const

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface AppInfo {
  version: string
  platform: string
  captureShortcut: string
  /** True when the global shortcut could not be registered (taken by another app). */
  shortcutUnavailable: boolean
}

/** Selection in CSS (DIP) pixels, relative to the overlay's display. */
export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayInit {
  /** JPEG preview of this display, only used as the frozen overlay backdrop. */
  preview: Uint8Array
  /** Physical pixels per DIP for the captured frame (2 on Retina). */
  pixelRatio: number
  displayWidth: number
  displayHeight: number
}

export interface EditorImage {
  bytes: Uint8Array
  mime: string
  /** Suggested base file name (no extension). */
  name: string
}

export type Result = { ok: true; message?: string } | { ok: false; canceled?: boolean; message: string }

export type MenuCommand =
  | 'save'
  | 'copy'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-fit'
  | 'zoom-actual'
  | 'delete'
  | 'bring-forward'
  | 'send-backward'
  | 'bring-to-front'
  | 'send-to-back'
  | 'clear'

export const MENU_COMMANDS: readonly MenuCommand[] = [
  'save',
  'copy',
  'undo',
  'redo',
  'zoom-in',
  'zoom-out',
  'zoom-fit',
  'zoom-actual',
  'delete',
  'bring-forward',
  'send-backward',
  'bring-to-front',
  'send-to-back',
  'clear'
]

/** The API available to renderers as `window.snapmark`. */
export interface SnapmarkApi {
  getAppInfo(): Promise<AppInfo>
  startCapture(): Promise<void>
  openImageFile(): Promise<Result>
  openImageBytes(bytes: Uint8Array, name: string): Promise<Result>
  pasteFromClipboard(): Promise<Result>
  getPermissionStatus(): Promise<PermissionStatus>
  openScreenRecordingSettings(): Promise<void>
  relaunch(): Promise<void>

  getOverlayInit(): Promise<OverlayInit>
  overlayReady(): void
  finishSelection(rect: SelectionRect | null): void

  getEditorImage(): Promise<EditorImage>
  saveImage(png: Uint8Array, suggestedName: string): Promise<Result>
  copyImage(png: Uint8Array): Promise<Result>
  setDirty(dirty: boolean): void

  onMenuCommand(cb: (cmd: MenuCommand) => void): () => void
  onShowPermissionHelp(cb: () => void): () => void
  onNotice(cb: (message: string) => void): () => void
}

export const MAX_IMAGE_BYTES = 200 * 1024 * 1024
