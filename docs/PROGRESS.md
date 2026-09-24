# Snapmark — build progress & handoff notes

_Last updated: 2026-09-24. The build is complete; see README.md for usage._

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

## Status (2026-09-24): complete

All the missing pieces were written: `index.html` (CSP), `main.tsx`, `views/Home.tsx`,
`views/Overlay.tsx`, `views/Toast.tsx`, `styles.css`, `scripts/generate-icons.mjs`, unit tests in
`tests/`, and the Playwright smoke test in `e2e/smoke.mjs`. Typecheck, 56 unit tests, the build,
the e2e run, and `dist` all pass. The packaged app is ad-hoc signed (`codesign --verify` passes).

Fixes made while verifying:
- **Electron 44 clipboard:** the API is now async and W3C-style (`read`/`write` with
  `ClipboardItem`), so `images.ts` was ported to it. A Finder file copy is read from the raw
  `public.file-url` type.
- **Export silently did nothing:** `canvasRefs` was filled in a mount effect, but the Stage mounts
  later, once it has a size. Callback refs fixed it, and export now reports an error if the canvas
  is missing.
- **First-run permission:** macOS reports `denied` before the app ever asks, and the old code gave
  up without calling `desktopCapturer`. The prompt never appeared, and Snapmark never showed up
  in the Screen Recording list. `ensureScreenPermission()` now makes one real request per launch.
- React, Konva, and zustand moved to devDependencies (Vite bundles them), so `node_modules` no
  longer ships in the asar.
- Image paths passed on the command line now open in the editor, and the smoke test relies on
  this. `SNAPMARK_FAKE_CAPTURE` is a test hook for unpackaged builds only.

Things verified along the way: the dev-mode React Refresh preamble is injected above the CSP
`<meta>`, so it runs. CDP-synthesized keys don't trigger app-menu accelerators, which is why the
e2e test clicks menu items directly. Real keystrokes go through the menu as designed.

Still unverified (needs real hardware and interaction): the overlay over the menu bar and
full-screen Spaces, real multi-display capture with permission granted, and ⌘Z inside the
textarea with a real keyboard.

### Remaining ideas
- Developer ID signing + notarization; universal (x64) build.
- Configurable shortcut; window-capture mode; PNG pHYs (DPI) chunk for Retina exports.
- Unrelated leftover: `~/Developer/screenshot` (the abandoned Next.js scaffold) still exists.
  Ask before deleting it.
