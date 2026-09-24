// End-to-end smoke test of the built app (run `npm run build` first, or `npm run e2e`).
//
// Opens a known 1024×1024 image from the command line, draws a callout and an
// arrow, copies the result, and checks that the clipboard image is exactly the
// source size with the annotations baked in. Also loads the home window and
// fails on any renderer console error (CSP violations included).
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shots = resolve(root, 'e2e/screenshots')
const source = resolve(root, 'build/icon.png')
mkdirSync(shots, { recursive: true })

const errors = []
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`))
}

async function launch(args = []) {
  return electron.launch({ args: [resolve(root, 'out/main/index.js'), ...args], cwd: root })
}

/**
 * Clicks an application menu item. Keys synthesized over CDP go straight to
 * the page, so macOS never routes them to menu key equivalents like ⌘Z.
 */
async function menu(app, top, label) {
  const ok = await app.evaluate(({ Menu }, [top, label]) => {
    const item = Menu.getApplicationMenu()
      ?.items.find((i) => i.label === top)
      ?.submenu?.items.find((i) => i.label === label)
    if (!item) return false
    item.click()
    return true
  }, [top, label])
  assert.ok(ok, `menu item ${top} → ${label} exists`)
}

function step(name) {
  console.log(`• ${name}`)
}

// ------------------------------------------------------------------ editor

step('open image from the command line')
const app = await launch([source])
const editor = await app.firstWindow()
watch(editor, 'editor')
await editor.waitForURL(/view=editor/)
await editor.locator('[data-testid="canvas"] canvas').first().waitFor()
await editor.locator('.statusbar').getByText('1024 × 1024 px').waitFor()

const canvas = editor.locator('[data-testid="canvas"]')
const box = await canvas.boundingBox()
assert.ok(box, 'canvas has a size')
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })

step('draw a callout and type a two-line message')
await editor.keyboard.press('c')
const tip = at(0.35, 0.7)
await editor.mouse.click(tip.x, tip.y)
const textarea = editor.locator('textarea.text-editor')
await textarea.waitFor()
await editor.keyboard.type('Click here')
await editor.keyboard.press('Enter')
await editor.keyboard.type('then save')
await editor.keyboard.press('Meta+Enter')
await textarea.waitFor({ state: 'detached' })
await editor.locator('.statusbar').getByText('1 annotation').waitFor()

step('draw an arrow')
await editor.keyboard.press('a')
const a1 = at(0.8, 0.2)
const a2 = at(0.6, 0.45)
await editor.mouse.move(a1.x, a1.y)
await editor.mouse.down()
await editor.mouse.move(a2.x, a2.y, { steps: 8 })
await editor.mouse.up()
await editor.locator('.statusbar').getByText('2 annotations').waitFor()

step('undo and redo from the menu')
await menu(app, 'Edit', 'Undo')
await editor.locator('.statusbar').getByText('1 annotation').waitFor()
await menu(app, 'Edit', 'Redo')
await editor.locator('.statusbar').getByText('2 annotations').waitFor()

await editor.screenshot({ path: resolve(shots, 'editor.png') })

step('copy and check the clipboard image')
await editor.getByRole('button', { name: 'Copy' }).click()
const toast = await editor.locator('.toast').first().textContent({ timeout: 15000 })
assert.equal(toast, 'Copied to clipboard')
const result = await app.evaluate(async ({ clipboard, nativeImage }, sourcePath) => {
  const items = await clipboard.read()
  const item = items.find((i) => i.types.includes('image/png'))
  if (!item) return { error: `no image on clipboard (types: ${items.flatMap((i) => i.types).join(', ')})` }
  const blob = await item.getType('image/png')
  const out = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()))
  const src = nativeImage.createFromPath(sourcePath)
  const a = out.toBitmap()
  const b = src.toBitmap()
  let changed = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++
  }
  return { size: out.getSize(), sourceSize: src.getSize(), changed }
}, source)
assert.equal(result.error, undefined, result.error)
assert.deepEqual(result.size, result.sourceSize, 'export is the source resolution')
assert.deepEqual(result.size, { width: 1024, height: 1024 })
// Callout label + tail + arrow cover several thousand pixels of the 1M.
assert.ok(result.changed > 3000, `annotations are baked into the export (${result.changed} px changed)`)
console.log(`  clipboard image ${result.size.width}×${result.size.height}, ${result.changed} px annotated`)

await app.close()

// ------------------------------------------------------- home + capture

step('home window')
const app2 = await electron.launch({
  args: [resolve(root, 'out/main/index.js')],
  cwd: root,
  // Dev-only hook: the primary display "shows" this image instead of the real screen.
  env: { ...process.env, SNAPMARK_FAKE_CAPTURE: source }
})
const home = await app2.firstWindow()
watch(home, 'home')
await home.waitForURL(/view=home/)
await home.getByRole('button', { name: /Capture Region/ }).waitFor()
await home.getByText('⇧⌘2').waitFor()
await home.screenshot({ path: resolve(shots, 'home.png') })

const scale = await app2.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)

async function openOverlay() {
  const next = app2.waitForEvent('window', { predicate: (p) => p.url().includes('view=overlay') })
  await home.getByRole('button', { name: /Capture Region/ }).click()
  const overlay = await next
  watch(overlay, 'overlay')
  await overlay.locator('.overlay-frame').waitFor()
  // Shown once the frozen frame has decoded.
  await overlay.waitForFunction(() => document.visibilityState === 'visible')
  return overlay
}

step('Esc cancels a capture')
let overlay = await openOverlay()
const closed = overlay.waitForEvent('close')
// The window closes mid-press, so the press itself may reject.
await overlay.keyboard.press('Escape').catch(() => {})
await closed
assert.equal(app2.windows().filter((p) => p.url().includes('view=editor')).length, 0)

step('drag a region: the editor gets the physical-pixel crop')
overlay = await openOverlay()
await overlay.mouse.move(100, 100)
await overlay.mouse.down()
await overlay.mouse.move(220, 180, { steps: 5 })
await overlay.mouse.move(300, 250, { steps: 5 })
await overlay.locator('.overlay-size').getByText(`${200 * scale} × ${150 * scale}`).waitFor()
await overlay.screenshot({ path: resolve(shots, 'overlay.png') })
const editorOpened = app2.waitForEvent('window', { predicate: (p) => p.url().includes('view=editor') })
await overlay.mouse.up()
const captured = await editorOpened
watch(captured, 'captured')
await captured.locator('.statusbar').getByText(`${200 * scale} × ${150 * scale} px`).waitFor()
console.log(`  captured ${200 * scale}×${150 * scale} px at ${scale}× scale`)
await app2.close()

assert.deepEqual(errors, [], `renderer errors:\n${errors.join('\n')}`)
console.log(`✓ smoke test passed (screenshots in ${shots})`)
