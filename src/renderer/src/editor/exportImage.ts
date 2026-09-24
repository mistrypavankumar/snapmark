import Konva from 'konva'

/**
 * Renders the content layer (screenshot + annotations, no selection UI) at
 * the screenshot's native resolution: 1 image pixel = 1 output pixel,
 * independent of the current zoom and the display's devicePixelRatio.
 *
 * The live layer is cloned into a detached 1:1 stage, so the on-screen view
 * is never resized or redrawn during export.
 */
export async function renderPng(layer: Konva.Layer, width: number, height: number): Promise<Uint8Array> {
  const prevRatio = Konva.pixelRatio
  // Clone at 1x so the offscreen layer canvas isn't allocated at 2x on Retina.
  Konva.pixelRatio = 1
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width, height })
  try {
    const clone = layer.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1, imageSmoothingEnabled: true }) as Konva.Layer
    stage.add(clone)
    const canvas = stage.toCanvas({ pixelRatio: 1 })
    if (canvas.width !== width || canvas.height !== height) {
      throw new Error(`Export size mismatch (${canvas.width}×${canvas.height}, expected ${width}×${height})`)
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('The image is too large to export.')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    stage.destroy()
    Konva.pixelRatio = prevRatio
  }
}
