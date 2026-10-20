import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { Button, Input, Label, Popover, TextField, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react'
import {
  BlockquoteIcon,
  BoldIcon,
  BulletListIcon,
  ClearContentIcon,
  ClearFormattingIcon,
  CodeBlockIcon,
  DownloadIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  MaximizeIcon,
  MinimizeIcon,
  OrderedListIcon,
  RedoIcon,
  SaveIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
  type EditorIcon,
} from './EditorIcons'
import {
  downloadText,
  exportBaseName,
  exportFilename,
  toHtmlDocument,
  toMarkdown,
  type ExportFormat,
} from './exportDocument'
import LinkDialog from './LinkDialog'

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

function countCharacters(text: string) {
  return Array.from(text).length
}

function countWords(text: string) {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latin = text.replace(CJK_RE, ' ').match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi)?.length ?? 0
  return cjk + latin
}

function normalizeHref(href: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(href)) return href
  return `https://${href}`
}

export interface RichTextEditorValue {
  json: JSONContent
  html: string
  text: string
  characters: number
  words: number
  isEmpty: boolean
}

export interface RichTextEditorHandle {
  editor: Editor
  getJSON: () => JSONContent
  getHTML: () => string
  getText: () => string
  focus: () => void
}

interface Props {
  defaultValue?: JSONContent | null
  onValueChange?: (value: RichTextEditorValue) => void
  onSaveDraft?: () => void
  placeholder?: string
  editable?: boolean
  className?: string
  footerLeft?: ReactNode
  showFooter?: boolean
}

interface ToolButtonProps {
  label: string
  icon: EditorIcon
  onPress: () => void
  isActive?: boolean
  isDisabled?: boolean
  round?: boolean
}

function ToolButton({ label, icon: Icon, onPress, isActive, isDisabled, round }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          isIconOnly
          size="sm"
          aria-label={label}
          aria-pressed={isActive}
          isDisabled={isDisabled}
          variant={isActive ? 'secondary' : round ? 'tertiary' : 'ghost'}
          onPress={onPress}
          className={
            isActive
              ? 'rounded-full! bg-accent-soft! text-accent! hover:bg-accent-soft-hover! active:bg-accent-soft-hover!'
              : 'rounded-full!'
          }
        >
          <Icon className="size-3.5!" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-separator" />
}

const EXPORT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'md', label: 'Markdown', ext: 'md' },
  { format: 'html', label: 'HTML', ext: 'html' },
  { format: 'txt', label: '纯文本', ext: 'txt' },
  { format: 'json', label: 'JSON', ext: 'json' },
]

// 编辑器销毁的瞬态窗口内（如 StrictMode 重新挂载）schema 为 null，需回退空快照
const EMPTY_SNAPSHOT = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  h1: false,
  h2: false,
  h3: false,
  codeBlock: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  link: false,
  canUndo: false,
  canRedo: false,
  isEmpty: true,
  characters: 0,
  words: 0,
}

function readSnapshot(instance: Editor) {
  if (!instance.schema) return EMPTY_SNAPSHOT
  const text = instance.getText()
  return {
    bold: instance.isActive('bold'),
    italic: instance.isActive('italic'),
    underline: instance.isActive('underline'),
    strike: instance.isActive('strike'),
    code: instance.isActive('code'),
    h1: instance.isActive('heading', { level: 1 }),
    h2: instance.isActive('heading', { level: 2 }),
    h3: instance.isActive('heading', { level: 3 }),
    codeBlock: instance.isActive('codeBlock'),
    blockquote: instance.isActive('blockquote'),
    bulletList: instance.isActive('bulletList'),
    orderedList: instance.isActive('orderedList'),
    link: instance.isActive('link'),
    canUndo: instance.can().undo(),
    canRedo: instance.can().redo(),
    isEmpty: instance.isEmpty,
    characters: countCharacters(text),
    words: countWords(text),
  }
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  {
    defaultValue,
    onValueChange,
    onSaveDraft,
    placeholder = '输入正文，支持 Markdown 快捷键…',
    editable = true,
    className = '',
    footerLeft,
    showFooter = true,
  },
  ref,
) {
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [fileName, setFileName] = useState(exportBaseName)
  const fileNameEditedRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
          markdownLinks: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: defaultValue ?? '',
    editable,
    editorProps: {
      attributes: {
        class: 'rich-text-editor__prosemirror',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const text = instance.getText()
      onValueChangeRef.current?.({
        json: instance.getJSON(),
        html: instance.getHTML(),
        text,
        characters: countCharacters(text),
        words: countWords(text),
        isEmpty: instance.isEmpty,
      })
    },
  })

  useEffect(() => {
    editor.setEditable(editable, false)
  }, [editor, editable])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)

  useEffect(() => {
    const refresh = () => setSnapshot(readSnapshot(editor))
    refresh()
    editor.on('transaction', refresh)
    editor.on('update', refresh)
    return () => {
      editor.off('transaction', refresh)
      editor.off('update', refresh)
    }
  }, [editor])

  const openLinkDialog = useCallback(() => {
    const href = editor.getAttributes('link').href
    setLinkHref(typeof href === 'string' ? href : '')
    setLinkOpen(true)
  }, [editor])

  const applyLink = useCallback(
    (href: string) => {
      const chain = editor.chain().focus().extendMarkRange('link')
      if (href) chain.setLink({ href: normalizeHref(href) }).run()
      else chain.unsetLink().run()
      setLinkOpen(false)
    },
    [editor],
  )

  const removeLink = useCallback(() => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkOpen(false)
  }, [editor])

  const handleExport = useCallback(
    (format: ExportFormat) => {
      setExportOpen(false)
      const filename = exportFilename(fileName, format)
      if (format === 'json') {
        downloadText(filename, `${JSON.stringify(editor.getJSON(), null, 2)}\n`, format)
      } else if (format === 'html') {
        downloadText(filename, toHtmlDocument(editor.getHTML()), format)
      } else if (format === 'md') {
        downloadText(filename, toMarkdown(editor.getJSON()), format)
      } else {
        const text = editor.getText().replace(/\n{3,}/g, '\n\n').trimEnd()
        downloadText(filename, text ? `${text}\n` : text, format)
      }
    },
    [editor, fileName],
  )

  const handleExportOpenChange = (open: boolean) => {
    if (open && !fileNameEditedRef.current) setFileName(exportBaseName())
    setExportOpen(open)
  }

  useImperativeHandle(
    ref,
    () => ({
      editor,
      getJSON: () => editor.getJSON(),
      getHTML: () => editor.getHTML(),
      getText: () => editor.getText(),
      focus: () => editor.commands.focus(),
    }),
    [editor],
  )

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-surface ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-0'
          : 'rounded-2xl border border-separator shadow-sm'
      } ${className}`}
    >
      <div className="flex min-h-12 flex-wrap items-center gap-1 border-b border-separator/70 px-2 py-2">
        <ToolButton
          label="撤销"
          icon={UndoIcon}
          round
          isDisabled={!snapshot.canUndo}
          onPress={() => editor.chain().focus().undo().run()}
        />
        <ToolButton
          label="重做"
          icon={RedoIcon}
          round
          isDisabled={!snapshot.canRedo}
          onPress={() => editor.chain().focus().redo().run()}
        />
        <Divider />
        <ToolButton
          label="加粗"
          icon={BoldIcon}
          isActive={snapshot.bold}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          label="斜体"
          icon={ItalicIcon}
          isActive={snapshot.italic}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          label="下划线"
          icon={UnderlineIcon}
          isActive={snapshot.underline}
          onPress={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          label="删除线"
          icon={StrikethroughIcon}
          isActive={snapshot.strike}
          onPress={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolButton
          label="行内代码"
          icon={InlineCodeIcon}
          isActive={snapshot.code}
          onPress={() => editor.chain().focus().toggleCode().run()}
        />
        <Divider />
        <ToolButton
          label="一级标题"
          icon={Heading1Icon}
          isActive={snapshot.h1}
          onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          label="二级标题"
          icon={Heading2Icon}
          isActive={snapshot.h2}
          onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          label="三级标题"
          icon={Heading3Icon}
          isActive={snapshot.h3}
          onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolButton
          label="引用"
          icon={BlockquoteIcon}
          isActive={snapshot.blockquote}
          onPress={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          label="代码块"
          icon={CodeBlockIcon}
          isActive={snapshot.codeBlock}
          onPress={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <Divider />
        <ToolButton
          label="无序列表"
          icon={BulletListIcon}
          isActive={snapshot.bulletList}
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          label="有序列表"
          icon={OrderedListIcon}
          isActive={snapshot.orderedList}
          onPress={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton label="链接" icon={LinkIcon} isActive={snapshot.link} onPress={openLinkDialog} />
        <Divider />
        <ToolButton
          label="清除格式"
          icon={ClearFormattingIcon}
          round
          isDisabled={snapshot.isEmpty}
          onPress={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
        <ToolButton
          label="清空内容"
          icon={ClearContentIcon}
          round
          isDisabled={snapshot.isEmpty}
          onPress={() => editor.chain().focus().clearContent(true).run()}
        />
        <Divider />
        <div className="ml-auto flex items-center gap-1">
          {onSaveDraft && (
            <ToolButton label="保存草稿" icon={SaveIcon} round onPress={onSaveDraft} />
          )}
          <Popover isOpen={exportOpen} onOpenChange={handleExportOpenChange}>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label="导出文件"
              isDisabled={snapshot.isEmpty}
              className="rounded-full!"
            >
              <DownloadIcon className="size-3.5!" />
            </Button>
            <Popover.Content className="w-60 p-2">
              <TextField
                value={fileName}
                onChange={(value) => {
                  fileNameEditedRef.current = true
                  setFileName(value)
                }}
                className="pb-2"
              >
                <Label className="text-xs">文件名</Label>
                <Input
                  autoFocus
                  aria-label="文件名"
                  placeholder="输入文件名"
                  className="text-xs!"
                />
              </TextField>
              <div role="menu" aria-label="导出格式" className="flex flex-col gap-0.5">
                {EXPORT_OPTIONS.map((option) => (
                  <Button
                    key={option.format}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 px-2"
                    onPress={() => handleExport(option.format)}
                  >
                    <span className="flex-1 text-left">{option.label}</span>
                    <span className="text-xs text-muted">.{option.ext}</span>
                  </Button>
                ))}
              </div>
            </Popover.Content>
          </Popover>
          <ToolButton
            label={isFullscreen ? '退出全屏' : '全屏'}
            icon={isFullscreen ? MinimizeIcon : MaximizeIcon}
            round
            onPress={() => setIsFullscreen((value) => !value)}
          />
        </div>
      </div>

      <EditorContent
        editor={editor}
        className="rich-text-editor__scroll min-h-0 flex-1 overflow-y-auto px-6 py-5"
      />

      <BubbleMenu
        editor={editor}
        appendTo={() => document.body}
        options={{ strategy: 'fixed', placement: 'top', offset: 8 }}
        className="z-50 flex items-center gap-0.5 rounded-xl border border-separator bg-surface p-1 shadow-lg"
      >
        <ToolButton
          label="加粗"
          icon={BoldIcon}
          isActive={snapshot.bold}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          label="斜体"
          icon={ItalicIcon}
          isActive={snapshot.italic}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          label="下划线"
          icon={UnderlineIcon}
          isActive={snapshot.underline}
          onPress={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          label="删除线"
          icon={StrikethroughIcon}
          isActive={snapshot.strike}
          onPress={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolButton
          label="链接"
          icon={LinkIcon}
          isActive={snapshot.link}
          onPress={openLinkDialog}
        />
      </BubbleMenu>

      {showFooter && (
        <div className="flex items-center justify-between gap-4 border-t border-separator/70 px-5 py-2.5 text-xs text-muted">
          <span>{footerLeft ?? '支持 Markdown 快捷键'}</span>
          <span className="shrink-0 tabular-nums">
            {snapshot.characters} 字符 · {snapshot.words} 词
          </span>
        </div>
      )}

      <LinkDialog
        isOpen={linkOpen}
        initialHref={linkHref}
        hasLink={snapshot.link}
        onClose={() => setLinkOpen(false)}
        onApply={applyLink}
        onRemove={removeLink}
      />
    </div>
  )
})

export default RichTextEditor
