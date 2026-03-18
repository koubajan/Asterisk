import { useEffect, useCallback, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { useArtifacts } from '../../store/useArtifacts'
import { useWorkspace } from '../../store/useWorkspace'
import { asteriskFileUrl } from '../../utils/imageUrl'
import './PresentationOverlay.css'

const CODE_EXTENSIONS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', json: 'json', css: 'css', html: 'html', htm: 'html', xml: 'xml',
  sh: 'bash', bash: 'bash', sql: 'sql', go: 'go', rs: 'rust', rb: 'ruby',
  java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp'
}
const CODE_EXT_RE = new RegExp('\\.(' + Object.keys(CODE_EXTENSIONS).join('|') + ')$', 'i')
const CSV_RE = /\.csv$/i
const YAML_RE = /\.(yaml|yml)$/i
const MARKDOWN_RE = /\.(md|markdown|txt)$/i
const PDF_RE = /\.pdf$/i

type FilePreviewType = 'markdown' | 'code' | 'csv' | 'yaml' | 'plain' | 'error' | null

function resolveFilePath(workspacePath: string | null, content: string): string {
  const raw = (content ?? '').trim().replace(/^file:\/\/+/i, '').replace(/\\/g, '/')
  if (!raw) return ''
  if (raw.startsWith('/') || /^[A-Za-z]:[/\\]/i.test(raw)) return raw
  const base = (workspacePath ?? '').replace(/\/$/, '')
  return raw.startsWith('./') ? `${base}/${raw.slice(2)}` : `${base}/${raw}`
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url || !/youtube\.com|youtu\.be/i.test(url)) return null
  try {
    const u = new URL(url.trim())
    if (/youtu\.be/i.test(u.hostname)) {
      const id = u.pathname.slice(1).split(/[?/]/)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    const v = u.searchParams.get('v')
    return v ? `https://www.youtube.com/embed/${v}` : null
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function PresentationOverlay() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [filePreviewType, setFilePreviewType] = useState<FilePreviewType>(null)

  const presentationMode = useArtifacts((s) => s.presentationMode)
  const presentationIndex = useArtifacts((s) => s.presentationIndex)
  const presentationOrder = useArtifacts((s) => s.presentationOrder)
  const nodes = useArtifacts((s) => s.data.nodes)
  const stopPresentation = useArtifacts((s) => s.stopPresentation)
  const nextSlide = useArtifacts((s) => s.nextSlide)
  const prevSlide = useArtifacts((s) => s.prevSlide)
  const goToSlide = useArtifacts((s) => s.goToSlide)

  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const workspacePath = workspaces[activeWorkspaceIndex]?.path ?? null

  const currentNodeId = presentationOrder[presentationIndex]
  const currentNode = useMemo(
    () => nodes.find((n) => n.id === currentNodeId),
    [nodes, currentNodeId]
  )

  // Load file content for file nodes
  useEffect(() => {
    if (!currentNode || currentNode.type !== 'file' || !currentNode.content) {
      setFileContent(null)
      setFilePreviewType(null)
      return
    }

    const path = currentNode.content.trim()
    
    // Determine file type
    if (CODE_EXT_RE.test(path)) {
      setFilePreviewType('code')
    } else if (CSV_RE.test(path)) {
      setFilePreviewType('csv')
    } else if (YAML_RE.test(path)) {
      setFilePreviewType('yaml')
    } else if (MARKDOWN_RE.test(path)) {
      setFilePreviewType('markdown')
    } else {
      setFilePreviewType('plain')
    }

    const loadFile = async () => {
      try {
        const fullPath = resolveFilePath(workspacePath, currentNode.content!)
        const result = await window.asterisk.readFile(fullPath)
        if (result.ok && result.data) {
          setFileContent(result.data.content)
        } else {
          setFilePreviewType('error')
        }
      } catch {
        setFilePreviewType('error')
      }
    }
    loadFile()
  }, [currentNode, workspacePath])

  // Format HTML the same way as CanvasNode
  const formattedHtml = useMemo(() => {
    if (!currentNode) return ''
    
    if (currentNode.type === 'text') {
      const raw = currentNode.content || ''
      if (!raw) return ''
      const parsed = marked.parse(raw) as string
      return DOMPurify.sanitize(parsed, { ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked'] })
    }
    
    if (currentNode.type === 'file' && fileContent) {
      if (filePreviewType === 'code' || filePreviewType === 'yaml') {
        const ext = (currentNode.content ?? '').replace(/^.*\./, '').toLowerCase()
        const lang = filePreviewType === 'yaml' ? 'yaml' : (CODE_EXTENSIONS[ext] ?? 'plaintext')
        try {
          const result = hljs.highlight(fileContent, { language: lang })
          return DOMPurify.sanitize('<pre><code class="hljs">' + result.value + '</code></pre>', { ADD_TAGS: ['pre', 'code', 'span'], ADD_ATTR: ['class'] })
        } catch {
          return DOMPurify.sanitize('<pre><code>' + escapeHtml(fileContent) + '</code></pre>', { ADD_TAGS: ['pre', 'code'] })
        }
      }
      if (filePreviewType === 'markdown') {
        const parsed = marked.parse(fileContent) as string
        return DOMPurify.sanitize(parsed, { ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked'] })
      }
    }
    
    return ''
  }, [currentNode, fileContent, filePreviewType])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!presentationMode) return
      
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
          e.preventDefault()
          nextSlide()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
          e.preventDefault()
          prevSlide()
          break
        case 'Escape':
          e.preventDefault()
          if (isFullscreen) {
            document.exitFullscreen?.()
          } else {
            stopPresentation()
          }
          break
        case 'Home':
          e.preventDefault()
          goToSlide(0)
          break
        case 'End':
          e.preventDefault()
          goToSlide(presentationOrder.length - 1)
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    },
    [presentationMode, nextSlide, prevSlide, stopPresentation, goToSlide, presentationOrder.length, isFullscreen]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  if (!presentationMode || !currentNode) return null

  const renderContent = () => {
    switch (currentNode.type) {
      case 'text': {
        return (
          <div className="presentation-slide">
            {currentNode.content ? (
              <div
                className="canvas-node-markdown presentation-markdown"
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
              />
            ) : (
              <div className="presentation-empty">No content</div>
            )}
          </div>
        )
      }
      
      case 'file': {
        const path = currentNode.content ?? ''
        
        // PDF
        if (PDF_RE.test(path)) {
          return (
            <div className="presentation-slide presentation-pdf">
              <iframe
                title="PDF"
                src={`${asteriskFileUrl(resolveFilePath(workspacePath, path))}#toolbar=0`}
                className="presentation-pdf-iframe"
              />
            </div>
          )
        }
        
        // Error or loading
        if (filePreviewType === 'error') {
          return <div className="presentation-slide presentation-error">Failed to load file</div>
        }
        if (!fileContent) {
          return <div className="presentation-slide presentation-loading">Loading...</div>
        }
        
        // CSV
        if (filePreviewType === 'csv') {
          return (
            <div className="presentation-slide">
              <div className="canvas-node-csv-wrap presentation-csv">
                <table className="canvas-node-csv-table">
                  <tbody>
                    {fileContent.split(/\r?\n/).filter(Boolean).slice(0, 30).map((line, i) => {
                      const cells = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
                      return (
                        <tr key={i}>
                          {cells.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
        
        // Code
        if (filePreviewType === 'code' || filePreviewType === 'yaml') {
          return (
            <div className="presentation-slide">
              <div
                className="canvas-node-code-preview presentation-code"
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
              />
            </div>
          )
        }
        
        // Markdown
        if (filePreviewType === 'markdown') {
          return (
            <div className="presentation-slide">
              <div
                className="canvas-node-markdown presentation-markdown"
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
              />
            </div>
          )
        }
        
        // Plain text
        return (
          <div className="presentation-slide">
            <pre className="canvas-node-plain-preview presentation-plain">{fileContent}</pre>
          </div>
        )
      }
      
      case 'image': {
        const src = currentNode.content?.startsWith('data:')
          ? currentNode.content
          : asteriskFileUrl(resolveFilePath(workspacePath, currentNode.content || ''))
        return (
          <div className="presentation-slide presentation-image-slide">
            <img src={src} alt={currentNode.title || 'Image'} className="presentation-image" />
          </div>
        )
      }
      
      case 'link': {
        const embedUrl = getYouTubeEmbedUrl(currentNode.content ?? '') ?? currentNode.content
        return (
          <div className="presentation-slide presentation-embed-slide">
            <iframe
              src={embedUrl}
              title={currentNode.title || 'Embedded content'}
              className="presentation-embed-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
      }
      
      default:
        return <div className="presentation-slide presentation-empty">Unsupported node type</div>
    }
  }

  return (
    <div className="presentation-overlay">
      <div className="presentation-header">
        <div className="presentation-title">
          {currentNode.title || `Slide ${presentationIndex + 1}`}
        </div>
        <div className="presentation-controls-top">
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button onClick={stopPresentation} title="Exit presentation (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="presentation-content">
        {renderContent()}
      </div>

      <div className="presentation-footer">
        <button
          className="presentation-nav-btn"
          onClick={prevSlide}
          disabled={presentationIndex === 0}
          title="Previous (←)"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="presentation-progress">
          <div className="presentation-dots">
            {presentationOrder.map((_, i) => (
              <button
                key={i}
                className={`presentation-dot${i === presentationIndex ? ' active' : ''}`}
                onClick={() => goToSlide(i)}
                title={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <span className="presentation-counter">
            {presentationIndex + 1} / {presentationOrder.length}
          </span>
        </div>

        <button
          className="presentation-nav-btn"
          onClick={nextSlide}
          disabled={presentationIndex === presentationOrder.length - 1}
          title="Next (→)"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  )
}
