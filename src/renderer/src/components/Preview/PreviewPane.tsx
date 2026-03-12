import { useMemo, useCallback, useEffect, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useWorkspace } from '../../store/useWorkspace'
import './PreviewPane.css'

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false
})

function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:')
}

function isFileLink(href: string): boolean {
  return href.endsWith('.md') || href.endsWith('.markdown') || href.endsWith('.txt')
}

export default function PreviewPane() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const content = openFile?.content ?? ''
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content) as string
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ['input'],
      ADD_ATTR: ['type', 'checked']
    })
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
  }, [html, openFile?.path, updateContent])

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
      <div
        ref={containerRef}
        className="preview-content"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </div>
  )
}
