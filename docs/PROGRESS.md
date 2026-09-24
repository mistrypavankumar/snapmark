# Snapmark — build progress & handoff notes

_Last updated: 2026-09-23. Written mid-build so work can resume from here._

## Goal (the user's spec, condensed)

A standalone macOS screenshot + annotation app. Electron + React + TypeScript, fully local:
no account, backend, or upload.

- A global shortcut starts capture while any app is active. Hide our windows, then drag
  to select a region. Must support multiple monitors and Retina.
- The capture opens straight in the editor. The user can also open an image file or paste
  one from the clipboard.
- Output: copy to clipboard, or save as a PNG at the original resolution.
- Tools: select/move/resize/reorder/delete, arrow, line, rect, ellipse, pen, highlight, text,
  and a **message callout**: a solid red rounded label with bold white text and a tapered
  pointer. The message is editable, the label is movable, and the tip adjusts independently.
  Multiline text; the label auto-sizes. (The reference image never came through; the
  callout is built from the text description.)
- Controls for color, stroke, fill, font size, and opacity. Undo/redo, zoom, shortcuts.
- Annotations stay separate objects until export. Geometry is stored in image coordinates.
- macOS Screen Recording permission: handle it clearly, with instructions when denied.
- Secure Electron: context isolation, a narrow typed preload, no Node in the renderer.
- Package an installable Mac app. Run the build and tests, then report dev/package
  commands, capture limitations, and what remains.

Unrelated leftover: `~/Developer/screenshot` is a Next.js scaffold from an earlier,
abandoned version of this request. It hasn't been deleted; ask the user before removing it.

## Stack & key decisions

| Area | Choice | Why |
|---|---|---|
| Build | electron-vite 5 + Vite **7** (electron-vite 5 does not support Vite 8) | Standard main/preload/renderer split |
| Packaging | electron-builder 26, `electron-builder.yml`, dmg + zip, arm64, ad-hoc signed (`identity: '-'`) | Apple Silicon requires at least an ad-hoc signature |
| Drawing | **Konva 10 + react-konva 19** | Maintained; Transformer handles, fast drag without React renders, layer cloning for export |
| State | zustand 5 (vanilla `createStore`, so it's testable without React) | Selectors keep re-renders narrow |
| TS | ~5.9 (TS 7 is the native port, so avoided for tooling stability) | |
| Tests | vitest 5, node env, `tests/**/*.test.ts` | Pure-logic tests |
| Capture | `desktopCapturer` frames per display → one frozen-image overlay window per display | A custom UI that shows exactly what gets captured. Alternative considered: `screencapture -i` |

### Architecture

- `src/shared/ipc.ts`: the whole IPC contract (channel names, `SnapmarkApi`, payload types).
- `src/preload/index.ts`: exposes `window.snapmark` via `contextBridge`, one fixed channel per
  function. `src/preload/api.d.ts` holds the global typing.
- Main process:
  - `index.ts`: lifecycle, single-instance lock, `open-file`, tray, global shortcut
    `CommandOrControl+Shift+2`. Denies all permission requests, `window.open`, navigation,
    and webviews.
  - `windows.ts`: `secureWebPreferences()` (sandbox, contextIsolation, no nodeIntegration,
    devTools only in dev). `isTrustedSender()` checks the IPC sender URL. Creates the home,
    editor (hiddenInset title bar, unsaved-changes prompt on close), and overlay windows
    (`type: 'panel'`, screen-saver level, all workspaces). Per-window data lives in maps keyed
    by `webContents.id` (`editorImages`, `overlayInits`); no IDs go in URLs.
  - `capture.ts`: permission check → hide our windows (220 ms delay) → capture every display.
    Displays are grouped by physical size so `thumbnailSize` is exact per display, and matched
    by `display_id`. It then opens overlays, which are shown once every overlay reports ready.
    Before showing, it calls `app.focus({steal:true})`. Escape is a temporary globalShortcut.
    `finishSelection` crops the full-resolution frame and opens the editor.
  - `captureMath.ts`: pure. `selectionToPixels` converts DIPs to frame pixels using the actual
    frame/display ratio, rounds outward, and clamps. Also `physicalSize`, `isValidSelection`,
    `screenshotName`, `sniffImageMime`.
  - `images.ts`: open file dialog (converts HEIC/TIFF through `nativeImage`), open bytes, paste
    from clipboard (image, or a file URL copied in Finder), save dialog, `copyImage`. Clipboard
    writes happen in main.
  - `ipc.ts`: registers handlers; every call is checked with `isTrustedSender` and its
    arguments are validated.
  - `menu.ts`: app menu. Editor shortcuts are **menu-owned** (undo, redo, save, copy, zoom,
    arrange, clear) and sent to the renderer as `MenuCommand`s. The renderer decides whether
    a command targets a focused textarea (via `execCommand`) or the canvas. This keeps each
    shortcut from firing twice.
- Renderer (`src/renderer/src`):
  - `lib/types.ts`: the `Annotation` union: line/arrow, rect/ellipse (fill: none, tint, or
    solid), pen/highlight (flat points), text, callout (label x/y plus absolute tipX/tipY).
    Every type has color, strokeWidth, and opacity.
  - `lib/geometry.ts`: zoom/pan math (`fitView`, which caps at 1 image px per device px;
    `zoomAt`; `stepZoom`), `calloutGeometry` (spine-anchored tapered tail), `bakeTransform`
    (bakes Konva scale into the model), `dragMove` (a callout drag moves only the label),
    `translate`, `setLineEndpoint`, `applyStyle` / `styleOf` / `STYLE_FIELDS`,
    `defaultStyles` (per tool, scaled to image size).
  - `lib/history.ts`: undo/redo with a `coalesceKey`, so a slider drag or nudge burst is one
    step. `lib/doc.ts`: add, replace, remove, reorder, `newId`. `lib/text.ts`: font stack,
    `layoutText`, `canvasMeasurer`.
  - `editor/store.ts`: the editor store (document history, selection, tool, per-tool styles,
    editing, view, dirty tracking via `saved`, notices). Also `draftStore` (the shape being
    drawn) and `previewStore` (a handle-drag preview).
  - `editor/CanvasView.tsx`: the Stage has a backdrop layer, a **content layer** (the image
    plus annotations; the only thing exported), and a UI layer (draft plus selection).
    Pointer gestures use window listeners. Panning (empty space in select mode, Space+drag,
    or middle mouse) moves the stage directly and commits on release. Wheel pans;
    ctrl/pinch zooms at the cursor.
  - `editor/AnnotationNode.tsx`: a memoized node per type. Arrow and callout are custom
    `Shape`s with a separate `hitFunc`. Konva's Arrow was avoided because its shaft pokes
    through the tip. The callout's label and tail are filled as separate paths, so winding
    direction can't cut a hole where they overlap. Highlight uses `multiply` blending.
  - `editor/SelectionLayer.tsx`: a Transformer for rect, ellipse, pen, highlight, and text
    (text keeps its ratio and scales fontSize). Point handles cover line/arrow endpoints and
    the callout tip, driven through `previewStore`.
  - `editor/TextEditor.tsx`: a transparent textarea laid over the text while the canvas hides
    it. The callout label resizes live. Esc or Cmd+Enter commits; empty text deletes.
  - `editor/exportImage.ts`: clones the content layer into a detached 1:1 stage with
    `Konva.pixelRatio = 1` and a size check → PNG `Uint8Array`.
  - `editor/Toolbar.tsx` (tool buttons, undo/redo, copy/save; plus `Inspector` with swatches,
    sliders, fill, arrange, clear), `editor/Editor.tsx` (image loading, dirty IPC, menu
    commands, single-key shortcuts, drop/paste opens a new window, status bar with zoom),
    `editor/icons.tsx`.

Shortcuts: V A L R O P H T C for tools. ⌫ deletes, Esc deselects, Enter edits text, arrow
keys nudge (Shift ×10), ⌘D duplicates, Space+drag pans. Menu shortcuts: ⌘Z / ⇧⌘Z, ⌘S,
⇧⌘C / ⌘C copy image, ⌘= ⌘- ⌘0 ⌘1, ⌘] ⌘[ (⇧ for front/back), ⇧⌘⌫ clear all, ⌘O,
⌘N new from clipboard.

## Status

### Done (written, **not yet compiled or tested**)
Every file listed under Architecture, plus the configs: `package.json` scripts,
`electron.vite.config.ts`, the tsconfigs (node/web), `vitest.config.ts`,
`electron-builder.yml`, `.gitignore`.

Note: `out/` contains a stale partial build. Ignore it; `npm run build` regenerates it.

### Missing — still to write
1. `src/renderer/index.html`, with a CSP meta tag (`default-src 'self'; img-src 'self' blob: data:;
   style-src 'self' 'unsafe-inline'`). Check that it works in dev with the React refresh preamble.
2. `src/renderer/src/main.tsx`: route on `?view=home|overlay|editor`.
3. `src/renderer/src/views/Toast.tsx`: `Editor.tsx` imports `{ Toast }` with no props. Either
   make it read `editorStore.notice`, or change it to accept a `notice` prop and update
   `Editor.tsx`. Home needs one too.
4. `src/renderer/src/views/Home.tsx`: capture button (shows the shortcut), open, paste, drop
   zone, paste event. Permission card when not granted: steps for System Settings → Privacy &
   Security → Screen & System Audio Recording → enable Snapmark → Quit & Reopen, with buttons
   calling `openScreenRecordingSettings` and `relaunch`. Re-check status on focus. Handle
   `onShowPermissionHelp` (highlight the card) and `onNotice` (toast). Warn when
   `shortcutUnavailable`. Footer: "stays on this Mac".
5. `src/renderer/src/views/Overlay.tsx`: frozen JPEG preview (object URL) → `overlayReady()`
   on load. Dim everything outside the selection (a selection div with a huge box-shadow),
   crosshair guides, a size readout in physical px (×`pixelRatio`), a hint pill. Update the
   drag directly on the DOM. On release, a selection ≥3px calls `finishSelection(rect)`; a
   plain click captures the full display. Esc calls `finishSelection(null)`.
6. `src/renderer/src/styles.css`: the polished UI. Classes in use: `editor toolbar drag-region
   no-drag traffic-light-space tool-group icon-btn tool-btn small spacer actions btn btn-primary
   ghost inspector field segmented field-label field-value slider swatch custom sr-only hint
   stage-area canvas-wrap tool-* panning grabbing over-annotation text-editor is-callout is-text
   statusbar zoom-controls zoom-value center-message`. Use light and dark variables. The
   hiddenInset title bar needs about 78px of left padding. `--icon-contrast` is used by the
   callout icon.
7. `scripts/generate-icons.mjs` (`npm run icons`): a zlib PNG writer. Generate
   `resources/trayTemplate.png` (16px) and `trayTemplate@2x.png` (black glyph plus alpha)
   and `build/icon.png` (1024px app icon).
8. Tests in `tests/`: history (undo, redo, coalesce, limit), doc (reorder/remove), store
   (finishEditing adds/removes, clear is undoable, setStyle applies and coalesces),
   geometry (callout tail null/inside and exact tip, bakeTransform for each type, fitView,
   zoomAt keeps its anchor fixed, stepZoom), and main `captureMath` (Retina 2×, fractional
   scale, clamping, outward rounding, sniff).
9. Optional e2e smoke test with Playwright `_electron`: open a known image through an env
   var, draw a callout, copy, and check that the clipboard image size equals the source size.
10. Run `npm run typecheck`, `npm test`, `npm run build`, `npm run dist`, and fix the errors.
    Confirm the ad-hoc signature with `codesign -dv dist/mac-arm64/Snapmark.app`.
11. Final report: files, commands, limitations, remaining work.

### Known risks / things to verify
- The overlay covering the menu bar (`setBounds` after show, panel type). Spaces with
  full-screen apps.
- Whether `desktopCapturer` returns `display_id` on this macOS (26.6.2); there is an order
  fallback.
- Menu accelerators versus renderer keydown ordering. The design avoids double firing either
  way, but still verify ⌘Z inside the textarea.
- `layer.clone()` keeps custom `sceneFunc`/`hitFunc` and attributes. `renderPng` asserts the
  output size.
- `setPermissionCheckHandler(() => false)` must not break anything the renderer needs.
- react-konva doesn't reset attributes that aren't passed as props. That's why drag/transform
  end handlers reset position and scale manually.

### Limitations to report
- Screen Recording permission is tied to the code signature. An ad-hoc build must be granted
  again after each rebuild, and the app must restart after granting. In dev, permission is
  attributed to the launching terminal or Electron.
- A selection can't span two displays. One overlay per display.
- There's no notarization or Developer ID, so the first launch needs right-click → Open.
- The shortcut is fixed (⌘⇧2) with no settings UI. PNGs carry no DPI metadata, so Retina
  captures paste at 2× size in some apps.
- Capture can't include the cursor, and there's no window-picking mode.
