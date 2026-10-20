import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import RichTextEditor, {
  type RichTextEditorHandle,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor'

const DRAFT_KEY = 'rich-text-editor:draft'

type SaveState = 'idle' | 'restored' | 'saving' | 'saved'

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '本地草稿自动保存',
  restored: '已恢复本地草稿',
  saving: '正在保存草稿…',
  saved: '草稿已保存',
}

const SAVE_DOT: Record<SaveState, string> = {
  idle: 'bg-muted',
  restored: 'bg-accent',
  saving: 'bg-warning',
  saved: 'bg-success',
}

function loadDraft(): JSONContent | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && (parsed as JSONContent).type === 'doc') {
      return parsed as JSONContent
    }
  } catch {
    // 草稿损坏时按空文档处理
  }
  return undefined
}

function persistDraft(value: Pick<RichTextEditorValue, 'json' | 'isEmpty'>) {
  try {
    if (value.isEmpty) localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(value.json))
  } catch {
    // 存储不可用时不影响编辑
  }
}

export default function EditorPage() {
  const [defaultContent] = useState<JSONContent | undefined>(loadDraft)
  const [saveState, setSaveState] = useState<SaveState>(defaultContent ? 'restored' : 'idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestValueRef = useRef<RichTextEditorValue | null>(null)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const handleValueChange = useCallback((value: RichTextEditorValue) => {
    latestValueRef.current = value
    setSaveState('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      persistDraft(value)
      timerRef.current = null
      setSaveState('saved')
    }, 500)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (latestValueRef.current) persistDraft(latestValueRef.current)
    }
  }, [])

  const handleSaveDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const handle = editorRef.current
    if (!handle) return
    persistDraft({ json: handle.getJSON(), isEmpty: handle.editor.isEmpty })
    latestValueRef.current = null
    setSaveState('saved')
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RichTextEditor
        ref={editorRef}
        className="min-h-0 flex-1"
        defaultValue={defaultContent}
        onValueChange={handleValueChange}
        onSaveDraft={handleSaveDraft}
        placeholder="开始输入，支持 Markdown 快捷键…"
        footerLeft={
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`size-1.5 rounded-full ${SAVE_DOT[saveState]}`} />
            {SAVE_LABEL[saveState]}
          </span>
        }
      />
    </div>
  )
}
