import { useMemo, useCallback, useEffect, useRef } from 'react'
import { marked, Renderer } from 'marked'
import DOMPurify from 'dompurify'
import { useWorkspace } from '../../store/useWorkspace'
import { MermaidBlock } from './MermaidRenderer'
import ExcalidrawEmbed from './ExcalidrawEmbed'
import './PreviewPane.css'

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false
})

const MERMAID_PLACEHOLDER = '___MERMAID_BLOCK___'
const EXCALIDRAW_PLACEHOLDER = '___EXCALIDRAW_EMBED___'

function createRendererWithPlaceholders(): Renderer {
  const renderer = new Renderer()
  const originalCode = renderer.code.bind(renderer)
  const originalImage = renderer.image.bind(renderer)

  renderer.code = function (token: any) {
    if (token.lang === 'mermaid') {
      return `<div class="mermaid-placeholder" data-mermaid-code="${encodeURIComponent(token.text)}">${MERMAID_PLACEHOLDER}</div>`
    }
    return originalCode(token)
  }

  renderer.image = function (token: any) {
    const href = token.href ?? token.src ?? ''
    if (typeof href === 'string' && href.endsWith('.excalidraw')) {
      return `<div class="excalidraw-embed-placeholder" data-excalidraw-path="${encodeURIComponent(href)}">${EXCALIDRAW_PLACEHOLDER}</div>`
    }
    return originalImage(token)
  }

  return renderer
}

interface ContentSegment {
  type: 'html' | 'mermaid' | 'excalidraw'
  content: string
  id?: string
}

function parseContentWithEmbeds(content: string): ContentSegment[] {
  const renderer = createRendererWithPlaceholders()
  const rawHtml = marked.parse(content, { renderer }) as string
  const sanitized = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['input', 'div'],
    ADD_ATTR: ['type', 'checked', 'data-mermaid-code', 'data-excalidraw-path', 'class']
  })

  const segments: ContentSegment[] = []
  // Split on both mermaid and excalidraw placeholders
  const combinedRe = /<div class="(?:mermaid-placeholder|excalidraw-embed-placeholder)" data-(?:mermaid-code|excalidraw-path)="([^"]*)">[^<]*<\/div>/g
  let lastIndex = 0
  let mermaidIndex = 0
  let excalidrawIndex = 0
  let match: RegExpExecArray | null

  while ((match = combinedRe.exec(sanitized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', content: sanitized.slice(lastIndex, match.index) })
    }
    const isMermaid = match[0].includes('mermaid-placeholder')
    if (isMermaid) {
      segments.push({
        type: 'mermaid',
        content: decodeURIComponent(match[1]),
        id: `mermaid-${mermaidIndex++}-${Date.now()}`
      })
    } else {
      segments.push({
        type: 'excalidraw',
        content: decodeURIComponent(match[1]),
        id: `excalidraw-${excalidrawIndex++}-${Date.now()}`
      })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < sanitized.length) {
    segments.push({ type: 'html', content: sanitized.slice(lastIndex) })
  }

  return segments
}

function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:')
}

function isFileLink(href: string): boolean {
  return href.endsWith('.md') || href.endsWith('.markdown') || href.endsWith('.txt')
}

export default function PreviewPane() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const content = openFile?.fileType && openFile.fileType !== 'text' ? '' : (openFile?.content ?? '')
  const containerRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => {
    if (!content) return []
    return parseContentWithEmbeds(content)
  }, [content])

  // After render: enable checkboxes and wire them to update content
  useEffect(() => {
    if (!containerRef.current || !openFile) return
    const checkboxes = containerRef.current.querySelectorAll('input[type="checkbox"]')
    const cleanups: (() => void)[] = []
    checkboxes.forEach((cb, index) => {
      const input = cb as HTMLInputElement
      input.disabled = false
      const handler = () => {
        const st = useWorkspace.getState()
        const current = st.openFiles[st.activeFileIndex]?.content ?? ''
        const lines = current.split('\n')
        let idx = 0
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (/^\s*[-*]\s+\[[ xX]\]/.test(line) || /^\s*\d+\.\s+\[[ xX]\]/.test(line)) {
            if (idx === index) {
              const checked = input.checked
              const newLine = line.replace(/\[[ xX]\]/, checked ? '[x]' : '[ ]')
              lines[i] = newLine
              updateContent(lines.join('\n'))
              return
            }
            idx++
          }
        }
      }
      input.addEventListener('change', handler)
      cleanups.push(() => input.removeEventListener('change', handler))
    })
    return () => cleanups.forEach((c) => c())
  }, [segments, openFile?.path, updateContent])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Handle link clicks
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor) {
      e.preventDefault()
      const href = anchor.getAttribute('href')
      if (!href) return

      if (isWebUrl(href)) {
        // Web link → open in external browser
        window.open(href, '_blank')
      } else if (isFileLink(href)) {
        // File link → open the .md file in the editor
        const currentPath = openFile?.path
        if (!currentPath) return
        const dir = currentPath.substring(0, currentPath.lastIndexOf('/'))
        // Resolve relative path
        const resolvedPath = href.startsWith('/')
          ? href
          : dir + '/' + href.replace(/^\.\//, '')
        // Open the file via IPC
        window.asterisk.readFile(resolvedPath).then((result) => {
          if (result.ok && result.data) {
            const fileName = resolvedPath.split('/').pop() ?? resolvedPath
            useWorkspace.getState().openFileNode({
              kind: 'file',
              name: fileName,
              path: resolvedPath,
              children: [],
              depth: 0
            })
          }
        })
      }
      return
    }
  }, [openFile?.path])

  return (
    <div className="preview-pane">
      <div ref={containerRef} className="preview-content" onClick={handleClick}>
        {segments.map((segment, index) =>
          segment.type === 'html' ? (
            <div
              key={index}
              dangerouslySetInnerHTML={{ __html: segment.content }}
            />
          ) : segment.type === 'mermaid' ? (
            <MermaidBlock
              key={segment.id}
              id={segment.id!}
              code={segment.content}
            />
          ) : (
            <ExcalidrawEmbed
              key={segment.id}
              relativePath={segment.content}
              currentFilePath={openFile?.path ?? ''}
            />
          )
        )}
      </div>
    </div>
  )
}
