import type { JSONContent } from '@tiptap/react'

export type ExportFormat = 'md' | 'html' | 'txt' | 'json'

const MIME: Record<ExportFormat, string> = {
  md: 'text/markdown',
  html: 'text/html',
  txt: 'text/plain',
  json: 'application/json',
}

const LIST_TYPES = new Set(['bulletList', 'orderedList'])

function renderInline(nodes: JSONContent[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n'
      if (node.type !== 'text') return node.text ?? ''
      let text = node.text ?? ''
      const marks = new Set((node.marks ?? []).map((mark) => mark.type))
      if (marks.has('code')) {
        text = `\`${text}\``
      } else {
        if (marks.has('bold')) text = `**${text}**`
        if (marks.has('italic')) text = `*${text}*`
        if (marks.has('strike')) text = `~~${text}~~`
        if (marks.has('underline')) text = `<u>${text}</u>`
      }
      const link = (node.marks ?? []).find((mark) => mark.type === 'link')
      const href = link?.attrs?.href
      if (typeof href === 'string' && href) text = `[${text}](${href})`
      return text
    })
    .join('')
}

function renderList(node: JSONContent, depth: number): string {
  const pad = '  '.repeat(depth)
  const childPad = '  '.repeat(depth + 1)
  const ordered = node.type === 'orderedList'
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1

  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${start + index}. ` : '- '
      const parts: string[] = []
      let first = true
      for (const child of item.content ?? []) {
        if (LIST_TYPES.has(child.type ?? '')) {
          parts.push(renderList(child, depth + 1))
          continue
        }
        const text = renderBlock(child, depth).replace(/\n/g, `\n${childPad}`)
        parts.push(first ? `${pad}${marker}${text}` : `${childPad}${text}`)
        first = false
      }
      return parts.join('\n') || `${pad}${marker.trimEnd()}`
    })
    .join('\n')
}

function renderBlock(node: JSONContent, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content)
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level) || 1)} ${renderInline(node.content)}`
    case 'blockquote': {
      const inner = renderBlocks(node.content, depth)
      return inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((child) => child.text ?? '').join('')
      const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
      const fence = '`'.repeat(Math.max(3, longest + 1))
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      return `${fence}${language}\n${text}\n${fence}`
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(node, depth)
    default:
      return renderInline(node.content)
  }
}

function renderBlocks(nodes: JSONContent[] = [], depth = 0): string {
  return nodes
    .map((node) => renderBlock(node, depth))
    .filter((block) => block.length > 0)
    .join('\n\n')
}

export function toMarkdown(doc: JSONContent): string {
  const body = renderBlocks(doc.content)
  return body ? `${body}\n` : ''
}

const HTML_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f4f4f5;
    color: #18181b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 15px;
    line-height: 1.75;
  }
  main {
    max-width: 820px;
    margin: 40px auto;
    padding: 48px 56px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }
  h1, h2, h3 { font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
  h1 { font-size: 30px; margin: 1.25em 0 0.5em; }
  h2 { font-size: 24px; margin: 1.1em 0 0.5em; }
  h3 { font-size: 20px; margin: 1em 0 0.5em; }
  main > :first-child { margin-top: 0; }
  p { margin: 0.75em 0; }
  ul, ol { margin: 0.75em 0; padding-left: 1.5rem; }
  li > p { margin: 0; }
  li + li { margin-top: 0.25em; }
  blockquote {
    margin: 0.75em 0;
    border-left: 3px solid #d4d4d8;
    padding-left: 1rem;
    color: #71717a;
  }
  code {
    border-radius: 4px;
    background: #f4f4f5;
    padding: 0.1rem 0.3rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
  }
  pre {
    max-height: 30vh;
    overflow: auto;
    margin: 0.75em 0;
    padding: 16px;
    border-radius: 12px;
    background: #f4f4f5;
    line-height: 1.6;
  }
  pre code { background: transparent; padding: 0; font-size: 13px; }
  a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  @media print {
    body { background: #fff; }
    main { margin: 0; padding: 0; box-shadow: none; }
  }
`

export function toHtmlDocument(body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>富文本导出</title>
<style>${HTML_STYLES}</style>
</head>
<body>
<main>${body}</main>
</body>
</html>
`
}

export function exportBaseName(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `富文本-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

const EXPORT_EXT_RE = /\.(?:md|html|txt|json)$/i
const INVALID_FILENAME_RE = /[\\/:*?"<>|\u0000-\u001f]/g

export function exportFilename(baseName: string, format: ExportFormat): string {
  const cleaned = baseName
    .replace(INVALID_FILENAME_RE, '')
    .replace(EXPORT_EXT_RE, '')
    .trim()
    .replace(/[. ]+$/, '')
  return `${cleaned || exportBaseName()}.${format}`
}

export function downloadText(filename: string, content: string, format: ExportFormat) {
  const blob = new Blob([content], { type: `${MIME[format]};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
