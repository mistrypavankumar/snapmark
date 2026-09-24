import { useEffect, useState } from 'react'
import { useEditor, type NoticeKind } from '../editor/store'

export interface Notice {
  id: number
  text: string
  kind: NoticeKind
}

const DURATION_MS = 2800

/**
 * Transient status message. Shows the editor store's notice by default;
 * other views pass their own `notice`.
 */
export function Toast(props: { notice?: Notice | null }) {
  const editorNotice = useEditor((s) => s.notice)
  const notice = props.notice !== undefined ? props.notice : editorNotice
  const [visible, setVisible] = useState<Notice | null>(null)

  useEffect(() => {
    if (!notice) return
    setVisible(notice)
    // Errors stay a little longer so they can be read.
    const t = setTimeout(() => setVisible(null), notice.kind === 'error' ? DURATION_MS * 2 : DURATION_MS)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {visible && (
        <div key={visible.id} className={`toast toast-${visible.kind}`}>
          {visible.text}
        </div>
      )}
    </div>
  )
}
