# Snapmark

Local screenshot capture and annotation for macOS. Electron + React + TypeScript.
No account, no backend, no uploads: images never leave the Mac.

- **Capture:** press **⇧⌘2** from any app (or use the menu bar icon or the Home window), then drag
  a region. A plain click captures the whole display, and Esc or right-click cancels.
  Works across multiple monitors and at Retina resolution.
- **Open:** image files (PNG, JPEG, GIF, WebP, BMP, HEIC, TIFF) via ⌘O, drag and drop, Finder
  “Open With”, or the command line. Paste from the clipboard with ⌘N or ⌘V on Home.
- **Annotate:** select/move/resize (V), arrow (A), line (L), rectangle (R), ellipse (O), pen (P),
  highlighter (H), text (T), and **message callout** (C): a solid rounded label with bold text and
  a tapered pointer. Click to place it, or press on the target and drag to where the label goes.
  The label moves independently of the tip, and the tip has its own handle.
- **Style:** color, stroke, fill (none/tint/solid), font size, callout padding, and opacity.
- **Export:** Copy (⇧⌘C, or ⌘C when nothing is being typed) or Save as PNG (⌘S), always at the
  image’s original pixel resolution.

## Commands

```sh
npm install
npm run dev        # run with hot reload
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # typecheck + production bundle in out/
npm run e2e        # build, then drive the real app with Playwright (see note below)
npm run dist       # build + package dist/Snapmark-<version>-arm64.dmg and .zip
npm run icons      # regenerate build/icon.png and the tray template icons
```

`npm run e2e` opens a 1024×1024 image, draws a callout and an arrow, copies the result, and
checks that the clipboard holds a 1024×1024 image with the annotations baked in. It also drives
a capture: the primary display briefly shows the overlay, with a test image standing in for the
real screen (`SNAPMARK_FAKE_CAPTURE`, which only works in unpackaged builds). **Don't touch the
mouse while it runs.** Real clicks reach the overlay and break the test.

## Keyboard

| Keys | Action |
|---|---|
| V A L R O P H T C | Tools |
| ⇧ while drawing | 45° lines, squares and circles, straight pen/highlighter strokes |
| ⌫ / Esc / Enter | Delete / deselect / edit selected text |
| Arrows (⇧ ×10) | Nudge |
| ⌘D | Duplicate |
| Space-drag, or drag empty space | Pan |
| Pinch or ⌘-scroll; ⌘= ⌘- ⌘0 ⌘1 | Zoom; zoom in/out/fit/actual size |
| ⌘] ⌘[ (⇧ for front/back) | Arrange |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⇧⌘⌫ | Clear all annotations (undoable) |
| Esc or ⌘Enter | Finish text editing |

## Screen Recording permission

macOS requires Screen Recording access. The first capture shows the system prompt. If access is
denied, the Home window explains how to enable it (System Settings → Privacy & Security → Screen
& System Audio Recording) and offers **Open System Settings** and **Quit & Reopen** buttons.
macOS applies the change only after a relaunch.

## Security

Every window uses `sandbox`, `contextIsolation`, and `nodeIntegration: false`. The preload
exposes a narrow typed API (`src/shared/ipc.ts`) with one fixed channel per function. The main
process checks that each IPC message comes from the bundled page and validates its arguments. The
app denies new windows, navigation, webviews, and all web permission requests. A strict CSP is
set, and DevTools are disabled in production.

## Limitations

- **Signing:** the package is ad-hoc signed, not Developer ID signed or notarized. On first launch,
  right-click the app → Open. Screen Recording permission is tied to the signature, so each
  rebuild must be granted again (remove the old entry, then re-add it). In `npm run dev`, macOS
  attributes the permission to Electron or your terminal.
- A selection can’t span two displays. Each display gets its own overlay.
- There’s no window-picking mode, and the cursor isn’t captured.
- The capture shortcut is fixed at ⇧⌘2, with no settings UI. If another app already uses it, the
  Home window shows a warning, and capture is still available from Home and the menu bar.
- Exported PNGs carry no DPI metadata, so some apps paste Retina captures at 2× size.
- The package is Apple Silicon (arm64) only. Add `x64` to `electron-builder.yml` for Intel.
