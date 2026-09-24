import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage } from 'electron'
import { MAX_IMAGE_BYTES, type Result } from '@shared/ipc'
import { screenshotName, sniffImageMime } from './captureMath'
import { createEditorWindow } from './windows'

const OPEN_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff']

/**
 * Opens bytes in an editor. Formats Chromium can't decode (HEIC, TIFF…)
 * are converted to PNG via the OS image decoder first.
 */
function openBytes(bytes: Uint8Array, name: string, path?: string): Result {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'That image is too large to open (limit 200 MB).' }
  }
  let mime = sniffImageMime(bytes)
  let data = bytes
  let img = mime ? nativeImage.createFromBuffer(Buffer.from(bytes)) : null
  if (!mime) {
    const converted = path
      ? nativeImage.createFromPath(path)
      : nativeImage.createFromBuffer(Buffer.from(bytes))
    if (converted.isEmpty()) {
      return { ok: false, message: `“${name}” isn’t an image format Snapmark can open.` }
    }
    data = new Uint8Array(converted.toPNG())
    mime = 'image/png'
    img = converted
  }
  const size = img && !img.isEmpty() ? img.getSize() : undefined
  createEditorWindow({ bytes: data, mime, name }, size)
  return { ok: true }
}

export async function openImageFileDialog(parent?: BrowserWindow | null): Promise<Result> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open Image',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: OPEN_EXTENSIONS }]
  }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true, message: '' }
  const errors: string[] = []
  for (const path of res.filePaths) {
    const r = await openImagePath(path)
    if (!r.ok) errors.push(r.message)
  }
  return errors.length ? { ok: false, message: errors.join('\n') } : { ok: true }
}

/** Image files named on the command line (`Snapmark shot.png`, or `electron . shot.png` in dev). */
export function imagePathsFromArgv(argv: readonly string[]): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && OPEN_EXTENSIONS.includes(extname(a).slice(1).toLowerCase()))
    .map((a) => resolve(a))
    .filter((p) => existsSync(p))
}

export async function openImagePath(path: string): Promise<Result> {
  try {
    const bytes = await readFile(path)
    return openBytes(new Uint8Array(bytes), basename(path, extname(path)), path)
  } catch (err) {
    return { ok: false, message: `Couldn’t read the file: ${(err as Error).message}` }
  }
}

export function openImageBytes(bytes: unknown, name: unknown): Result {
  if (!(bytes instanceof Uint8Array)) return { ok: false, message: 'Invalid image data.' }
  const safeName = typeof name === 'string' && name.trim() ? name.slice(0, 200) : screenshotName()
  return openBytes(bytes, safeName.replace(/\.[a-z0-9]+$/i, ''))
}

/** Raw macOS pasteboard type of a file copied in Finder. */
const FILE_URL_TYPE = 'electron application/osclipboard;format="public.file-url"'

async function blobText(item: Electron.ClipboardItem, type: string): Promise<string> {
  const data = await item.getType(type)
  return data instanceof Blob ? data.text() : ''
}

/** Reads an image (or a copied image file from Finder) from the system clipboard. */
export async function pasteFromClipboard(): Promise<Result> {
  const items = await clipboard.read().catch(() => [] as Electron.ClipboardItem[])
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const data = await item.getType(type)
    if (!(data instanceof Blob)) continue
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (bytes.byteLength > 0) {
      return openBytes(bytes, `Pasted ${screenshotName().replace('Screenshot ', '')}`)
    }
  }
  // A file copied in Finder arrives as a file URL.
  for (const item of items) {
    const type = item.types.find((t) => t === FILE_URL_TYPE || t === 'text/uri-list')
    if (!type) continue
    try {
      const url = (await blobText(item, type)).split(/\r?\n/).find((l) => l.startsWith('file:'))
      if (url) return await openImagePath(decodeURIComponent(new URL(url).pathname))
    } catch {
      // fall through to the error below
    }
  }
  return {
    ok: false,
    message:
      items.length === 0
        ? 'The clipboard is empty. Copy an image first, then paste.'
        : 'The clipboard doesn’t contain an image. Copy an image (or an image file in Finder) and try again.'
  }
}

export async function saveImage(
  parent: BrowserWindow | null,
  png: unknown,
  suggestedName: unknown
): Promise<Result> {
  if (!(png instanceof Uint8Array) || !sniffImageMime(png)?.includes('png')) {
    return { ok: false, message: 'Export produced invalid PNG data.' }
  }
  const base = typeof suggestedName === 'string' && suggestedName ? suggestedName : screenshotName()
  const options: Electron.SaveDialogOptions = {
    title: 'Save Image',
    defaultPath: `${base.replace(/[/:\\]/g, '-')}.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  }
  const res = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (res.canceled || !res.filePath) return { ok: false, canceled: true, message: '' }
  const path = res.filePath.toLowerCase().endsWith('.png') ? res.filePath : `${res.filePath}.png`
  try {
    await writeFile(path, png)
    return { ok: true, message: `Saved to ${basename(path)}` }
  } catch (err) {
    return { ok: false, message: `Couldn’t save: ${(err as Error).message}` }
  }
}

export async function copyImage(png: unknown): Promise<Result> {
  if (!(png instanceof Uint8Array) || !sniffImageMime(png)?.includes('png')) {
    return { ok: false, message: 'Export produced invalid PNG data.' }
  }
  if (nativeImage.createFromBuffer(Buffer.from(png)).isEmpty()) {
    return { ok: false, message: 'Couldn’t read the exported image.' }
  }
  try {
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(png)], { type: 'image/png' }) })])
  } catch (err) {
    return { ok: false, message: `Couldn’t copy: ${(err as Error).message}` }
  }
  return { ok: true, message: 'Copied to clipboard' }
}
