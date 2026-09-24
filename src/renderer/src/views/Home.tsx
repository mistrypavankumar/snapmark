import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, PermissionStatus, Result } from '@shared/ipc'
import { Icons } from '../editor/icons'
import { Toast, type Notice } from './Toast'

const api = window.snapmark

/** "CommandOrControl+Shift+2" → "⇧⌘2" (macOS modifier order). */
export function formatAccelerator(accel: string): string {
  const parts = accel.split('+')
  const key = parts.pop() ?? ''
  const mods = new Set(parts.map((p) => p.toLowerCase()))
  let out = ''
  if (mods.has('control') || mods.has('ctrl')) out += '⌃'
  if (mods.has('alt') || mods.has('option')) out += '⌥'
  if (mods.has('shift')) out += '⇧'
  if (mods.has('commandorcontrol') || mods.has('cmdorctrl') || mods.has('command') || mods.has('cmd')) out += '⌘'
  return out + key.toUpperCase()
}

export function Home() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [permission, setPermission] = useState<PermissionStatus>('unknown')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [highlight, setHighlight] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  const notify = useCallback((text: string, kind: Notice['kind'] = 'info') => {
    setNotice({ id: Date.now(), text, kind })
  }, [])

  const report = useCallback(
    (r: Result) => {
      if (!r.ok && !r.canceled && r.message) notify(r.message, 'error')
    },
    [notify]
  )

  const refreshPermission = useCallback(() => {
    void api.getPermissionStatus().then(setPermission)
  }, [])

  useEffect(() => {
    void api.getAppInfo().then(setInfo)
    refreshPermission()
    // The user may have just granted access in System Settings.
    window.addEventListener('focus', refreshPermission)
    const offHelp = api.onShowPermissionHelp(() => {
      refreshPermission()
      setHighlight(true)
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setHighlight(false), 1600)
    })
    const offNotice = api.onNotice((m) => notify(m, 'error'))
    return () => {
      window.removeEventListener('focus', refreshPermission)
      offHelp()
      offNotice()
    }
  }, [notify, refreshPermission])

  const openFile = useCallback(
    async (file: File) => {
      report(await api.openImageBytes(new Uint8Array(await file.arrayBuffer()), file.name))
    },
    [report]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      e.preventDefault()
      if (file) void openFile(file)
      else void api.pasteFromClipboard().then(report)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openFile, report])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|tiff?)$/i.test(f.name))
    if (files.length === 0) {
      notify('Drop an image file (PNG, JPEG, HEIC, …).', 'error')
      return
    }
    for (const f of files) void openFile(f)
  }

  const needsPermission = permission === 'denied' || permission === 'restricted'
  const shortcut = info ? formatAccelerator(info.captureShortcut) : '⇧⌘2'

  return (
    <div
      className={`home ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <div className="home-titlebar drag-region" />
      <main className="home-main">
        <header className="home-header">
          <div className="app-mark" aria-hidden="true">
            <Icons.callout />
          </div>
          <div>
            <h1>Snapmark</h1>
            <p className="subtle">Capture a region of your screen and mark it up.</p>
          </div>
        </header>

        <button type="button" className="capture-btn" onClick={() => void api.startCapture()}>
          <Icons.capture />
          <span className="capture-label">Capture Region</span>
          <kbd className="kbd">{shortcut}</kbd>
        </button>

        {info?.shortcutUnavailable && (
          <p className="warning" role="alert">
            Another app is using {shortcut}, so the global shortcut is off. You can still capture from here or from
            the Snapmark menu bar icon.
          </p>
        )}

        <div className="home-actions">
          <button type="button" className="btn" onClick={() => void api.openImageFile().then(report)}>
            <Icons.open /> <span>Open Image…</span>
          </button>
          <button type="button" className="btn" onClick={() => void api.pasteFromClipboard().then(report)}>
            <Icons.paste /> <span>Paste from Clipboard</span>
          </button>
        </div>

        <div className="drop-zone" aria-hidden="true">
          You can also drop an image here, or paste with ⌘V.
        </div>

        {needsPermission && (
          <section ref={cardRef} className={`permission-card ${highlight ? 'highlight' : ''}`} aria-labelledby="perm-title">
            <div className="permission-head">
              <Icons.shield />
              <h2 id="perm-title">Snapmark needs Screen Recording access</h2>
            </div>
            <p>macOS only lets apps with this permission capture the screen. To turn it on:</p>
            <ol>
              <li>
                Open <strong>System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording</strong>.
              </li>
              <li>
                Turn on <strong>Snapmark</strong>. If it isn’t listed, click <strong>+</strong> and add it from
                Applications.
              </li>
              <li>
                Choose <strong>Quit &amp; Reopen</strong> when macOS asks, or use the button below.
              </li>
            </ol>
            <div className="permission-actions">
              <button type="button" className="btn btn-primary" onClick={() => void api.openScreenRecordingSettings()}>
                Open System Settings
              </button>
              <button type="button" className="btn" onClick={() => void api.relaunch()}>
                Quit &amp; Reopen
              </button>
            </div>
          </section>
        )}
      </main>
      <footer className="home-footer">
        <Icons.shield /> Everything stays on this Mac. No account, no uploads.
        {info && <span className="version">v{info.version}</span>}
      </footer>
      <Toast notice={notice} />
    </div>
  )
}
