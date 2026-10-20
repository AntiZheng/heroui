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
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Button, Input, Label, Popover, TextField, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react'
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BlockquoteIcon,
  BoldIcon,
  BulletListIcon,
  ChevronDownIcon,
  ClearContentIcon,
  ClearFormattingIcon,
  CodeBlockIcon,
  DownloadIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HighlightIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  MaximizeIcon,
  MinimizeIcon,
  OrderedListIcon,
  RedoIcon,
  SaveIcon,
  StrikethroughIcon,
  TextColorIcon,
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
  defaultValue?: JSONContent | string | null
  onValueChange?: (value: RichTextEditorValue) => void
  onSaveDraft?: () => void
  placeholder?: string
  editable?: boolean
  className?: string
  footerLeft?: ReactNode
  showToolbar?: boolean
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

const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '30', '36'] as const

const TEXT_COLORS = [
  '#111827',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#ffffff',
]

const HIGHLIGHT_COLORS = [
  'rgba(250, 204, 21, 0.5)',
  'rgba(74, 222, 128, 0.45)',
  'rgba(96, 165, 250, 0.45)',
  'rgba(244, 114, 182, 0.4)',
  'rgba(167, 139, 250, 0.45)',
  'rgba(251, 146, 60, 0.45)',
  'rgba(148, 163, 184, 0.4)',
]

type TextAlignValue = 'left' | 'center' | 'right' | 'justify'

const TEXT_ALIGN_OPTIONS: { value: TextAlignValue; label: string; icon: EditorIcon }[] = [
  { value: 'left', label: '左对齐', icon: AlignLeftIcon },
  { value: 'center', label: '居中', icon: AlignCenterIcon },
  { value: 'right', label: '右对齐', icon: AlignRightIcon },
  { value: 'justify', label: '两端对齐', icon: AlignJustifyIcon },
]

interface Snapshot {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  h1: boolean
  h2: boolean
  h3: boolean
  codeBlock: boolean
  blockquote: boolean
  bulletList: boolean
  orderedList: boolean
  link: boolean
  fontSize: string | null
  textColor: string | null
  highlightColor: string | null
  textAlign: TextAlignValue
  canUndo: boolean
  canRedo: boolean
  isEmpty: boolean
  characters: number
  words: number
}

// 编辑器销毁的瞬态窗口内（如 StrictMode 重新挂载）schema 为 null，需回退空快照
const EMPTY_SNAPSHOT: Snapshot = {
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
  fontSize: null,
  textColor: null,
  highlightColor: null,
  textAlign: 'left',
  canUndo: false,
  canRedo: false,
  isEmpty: true,
  characters: 0,
  words: 0,
}

function readSnapshot(instance: Editor): Snapshot {
  if (!instance.schema) return EMPTY_SNAPSHOT
  const text = instance.getText()
  const textStyle = instance.getAttributes('textStyle') as {
    color?: string | null
    fontSize?: string | null
  }
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
    fontSize: typeof textStyle.fontSize === 'string' ? textStyle.fontSize : null,
    textColor: typeof textStyle.color === 'string' ? textStyle.color : null,
    highlightColor: instance.isActive('highlight')
      ? ((instance.getAttributes('highlight').color as string | undefined) ??
        HIGHLIGHT_COLORS[0])
      : null,
    textAlign:
      TEXT_ALIGN_OPTIONS.find((option) => instance.isActive({ textAlign: option.value }))
        ?.value ?? 'left',
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
    showToolbar = true,
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
  const [sizeOpen, setSizeOpen] = useState(false)
  const [textColorOpen, setTextColorOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [alignOpen, setAlignOpen] = useState(false)
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
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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

  const applyFontSize = (size: string) => {
    editor.chain().focus().setFontSize(`${size}px`).run()
    setSizeOpen(false)
  }

  const clearFontSize = () => {
    editor.chain().focus().unsetFontSize().run()
    setSizeOpen(false)
  }

  const applyTextColor = (color: string) => {
    editor.chain().focus().setColor(color).run()
    setTextColorOpen(false)
  }

  const clearTextColor = () => {
    editor.chain().focus().unsetColor().run()
    setTextColorOpen(false)
  }

  const applyHighlight = (color: string) => {
    if (snapshot.highlightColor === color) editor.chain().focus().unsetHighlight().run()
    else editor.chain().focus().setHighlight({ color }).run()
    setHighlightOpen(false)
  }

  const clearHighlight = () => {
    editor.chain().focus().unsetHighlight().run()
    setHighlightOpen(false)
  }

  const applyTextAlign = (value: TextAlignValue) => {
    editor.chain().focus().setTextAlign(value).run()
    setAlignOpen(false)
  }

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

  const ActiveAlignIcon =
    TEXT_ALIGN_OPTIONS.find((option) => option.value === snapshot.textAlign)?.icon ?? AlignLeftIcon

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-surface ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-0'
          : 'rounded-2xl border border-separator shadow-sm'
      } ${className}`}
    >
      {showToolbar && (
      <div className="flex min-h-12 flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-separator/70 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
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
        <Popover isOpen={sizeOpen} onOpenChange={setSizeOpen}>
          <Button
            size="sm"
            variant="tertiary"
            aria-label="字号"
            className="min-w-11 gap-0.5 rounded-full! px-1.5 text-xs font-normal"
          >
            {snapshot.fontSize ? snapshot.fontSize.replace('px', '') : '字号'}
            <ChevronDownIcon className="size-3!" />
          </Button>
          <Popover.Content className="w-40 p-1.5">
            <div role="menu" aria-label="字号" className="grid grid-cols-3 gap-0.5">
              <Button
                variant={snapshot.fontSize === null ? 'secondary' : 'ghost'}
                size="sm"
                className="justify-center px-1"
                onPress={clearFontSize}
              >
                默认
              </Button>
              {FONT_SIZES.map((size) => (
                <Button
                  key={size}
                  variant={snapshot.fontSize === `${size}px` ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-center px-1"
                  onPress={() => applyFontSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </Popover.Content>
        </Popover>
        <Popover isOpen={textColorOpen} onOpenChange={setTextColorOpen}>
          <Button
            size="sm"
            isIconOnly
            variant="tertiary"
            aria-label="字体颜色"
            className="relative rounded-full!"
          >
            <TextColorIcon className="size-3.5!" />
            <span
              aria-hidden
              className="absolute bottom-1 left-1/2 h-0.5 w-3.5 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: snapshot.textColor ?? 'currentColor' }}
            />
          </Button>
          <Popover.Content className="w-44 p-2">
            <div role="menu" aria-label="字体颜色" className="grid grid-cols-6 gap-1.5">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="menuitemradio"
                  aria-checked={snapshot.textColor === color}
                  aria-label={`字体颜色 ${color}`}
                  onClick={() => applyTextColor(color)}
                  className={`size-5 rounded-md border border-separator transition ${
                    snapshot.textColor === color
                      ? 'ring-2 ring-accent'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t border-separator/60 pt-2">
              <label
                title="自定义颜色"
                className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-separator"
              >
                <span
                  className="size-full"
                  style={{
                    background:
                      'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
                  }}
                />
                <input
                  type="color"
                  aria-label="自定义字体颜色"
                  value={
                    /^#[0-9a-f]{6}$/i.test(snapshot.textColor ?? '')
                      ? snapshot.textColor!
                      : '#111827'
                  }
                  onChange={(event) => applyTextColor(event.currentTarget.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <Button
                variant={snapshot.textColor === null ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 justify-center"
                onPress={clearTextColor}
              >
                默认色
              </Button>
            </div>
          </Popover.Content>
        </Popover>
        <Popover isOpen={highlightOpen} onOpenChange={setHighlightOpen}>
          <Button
            size="sm"
            isIconOnly
            variant="tertiary"
            aria-label="高亮"
            className="relative rounded-full!"
          >
            <HighlightIcon className="size-3.5!" />
            <span
              aria-hidden
              className="absolute bottom-1 left-1/2 h-0.5 w-3.5 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: snapshot.highlightColor ?? 'var(--separator)' }}
            />
          </Button>
          <Popover.Content className="w-44 p-2">
            <div role="menu" aria-label="高亮颜色" className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="menuitemradio"
                  aria-checked={snapshot.highlightColor === color}
                  aria-label={`高亮颜色 ${color}`}
                  onClick={() => applyHighlight(color)}
                  className={`h-6 rounded-md border border-separator transition ${
                    snapshot.highlightColor === color
                      ? 'ring-2 ring-accent'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <Button
                variant={snapshot.highlightColor === null ? 'secondary' : 'ghost'}
                size="sm"
                className="col-span-4 justify-center"
                onPress={clearHighlight}
              >
                无高亮
              </Button>
            </div>
          </Popover.Content>
        </Popover>
        <Divider />
        <Popover isOpen={alignOpen} onOpenChange={setAlignOpen}>
          <Button
            size="sm"
            variant="tertiary"
            aria-label="对齐方式"
            className="min-w-11 gap-0.5 rounded-full! px-1.5"
          >
            <ActiveAlignIcon className="size-3.5!" />
            <ChevronDownIcon className="size-3!" />
          </Button>
          <Popover.Content className="w-36 p-1.5">
            <div role="menu" aria-label="对齐方式" className="flex flex-col gap-0.5">
              {TEXT_ALIGN_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={snapshot.textAlign === option.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start gap-2 px-2"
                  onPress={() => applyTextAlign(option.value)}
                >
                  <option.icon className="size-3.5!" />
                  <span className="flex-1 text-left">{option.label}</span>
                </Button>
              ))}
            </div>
          </Popover.Content>
        </Popover>
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
        <div className="ml-auto flex items-center gap-0.5">
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
      )}

      <EditorContent
        editor={editor}
        className="rich-text-editor__scroll min-h-0 flex-1 overflow-y-auto px-6 py-5"
      />

      {editable && (
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
      )}

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
