import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { Excalidraw, THEME } from '@excalidraw/excalidraw'
import type { CanvasNode as CanvasNodeType } from '../../types/canvas'
import { asteriskFileUrl } from '../../utils/imageUrl'
import { useSettings, PRESET_THEMES } from '../../store/useSettings'

/** File preview type for artifact file nodes */
type FilePreviewType = 'markdown' | 'code' | 'csv' | 'yaml' | 'plain' | 'excalidraw' | 'error' | null

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
const EXCALIDRAW_RE = /\.excalidraw$/i

interface CanvasNodeProps {
  node: CanvasNodeType
  workspacePath?: string
  onDrag: (dx: number, dy: number) => void
  onDragEnd?: () => void
  onSelect: (addToSelection?: boolean) => void
  selected: boolean
  onDoubleClick: () => void
  onContentChange?: (content: string) => void
  onTitleChange?: (title: string) => void
  onUpdate?: (updates: Partial<CanvasNodeType>) => void
  onResize?: (width: number, height: number) => void
  onShiftClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  connectionMode?: boolean
  /** When true, only dragging is allowed (no resize, edit, or color picker). */
  moveMode?: boolean
  /** When set, use this instead of loading file content in the node (Canvas loads and passes down). */
  filePreviewContent?: string | null
  filePreviewError?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveImagePath(workspacePath: string, relOrAbs: string): string {
  if (!relOrAbs) return ''
  if (relOrAbs.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relOrAbs)) return relOrAbs
  const base = workspacePath.replace(/\/$/, '')
  return relOrAbs.startsWith('./') ? `${base}/${relOrAbs.slice(2)}` : `${base}/${relOrAbs}`
}

/** When a custom background is set (not reset), use black text. Reset/default keeps theme text. */
function getContrastColor(bg: string): string {
  if (!bg || bg.startsWith('var(')) return ''
  const hex = bg.replace(/^#/, '')
  if (hex.length !== 6 && hex.length !== 8) return ''
  return '#1a1a1a'
}

/** YouTube watch or short URL -> embed URL. Returns null if not YouTube. */
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

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url ?? '')
}

/** Resolve file node content to absolute path for protocol. */
function resolveFilePath(workspacePath: string, content: string): string {
  const raw = (content ?? '').trim().replace(/^file:\/\/+/i, '').replace(/\\/g, '/')
  if (!raw) return ''
  if (raw.startsWith('/') || /^[A-Za-z]:[/\\]/i.test(raw)) return raw
  const base = workspacePath.replace(/\/$/, '')
  return raw.startsWith('./') ? `${base}/${raw.slice(2)}` : `${base}/${raw}`
}

function getCardTitle(node: CanvasNodeType): string {
  if (node.type === 'group') return 'Group'
  if (node.type === 'file' && node.content) {
    const name = node.content.replace(/^.*[/\\]/, '')
    return name || 'File'
  }
  if (node.type === 'link') return 'Link'
  if (node.type === 'text' && node.content) {
    const first = node.content.split('\n')[0].trim()
    return first.slice(0, 48) || 'Note'
  }
  if (node.type === 'image') return 'Image'
  return 'Card'
}

const NODE_MIN_HEIGHT = 44
const NODE_MAX_HEIGHT = 600
const NODE_HEADER_HEIGHT = 28
const NODE_CONTENT_PADDING = 12
const NODE_DEFAULT_WIDTH = 200
const NODE_DEFAULT_HEIGHT = 60
const IMAGE_NODE_MAX_WIDTH = 420
const IMAGE_NODE_MAX_HEIGHT = 340

/** Same palette as groups for consistent color options everywhere */
const PRESET_COLORS = [
  '#f5f5f5', '#e8e8e8', '#e3f2fd', '#e8f5e9', '#fff3e0', '#fce4ec', '#ede7f6',
  '#bbdefb', '#c8e6c9', '#ffe0b2', '#f8bbd9', '#d1c4e9'
]

export default function CanvasNode({ node, workspacePath = '', filePreviewContent, filePreviewError, onDrag, onDragEnd, onSelect, selected, onDoubleClick, onContentChange, onTitleChange, onUpdate, onResize, onShiftClick, onContextMenu, connectionMode, moveMode }: CanvasNodeProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const resizeStartRef = useRef({ w: 0, h: 0, x: 0, y: 0 })
  const didDragRef = useRef(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editValue, setEditValue] = useState(node.content)
  const [titleValue, setTitleValue] = useState(node.title ?? '')
  const [showColorPicker, setShowColorPicker] = useState<'bg' | 'border' | false>(false)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [filePreviewType, setFilePreviewType] = useState<FilePreviewType>(null)
  const [linkPreview, setLinkPreview] = useState<{ title?: string; description?: string; image?: string } | null>(null)
  const [linkPreviewImageDataUrl, setLinkPreviewImageDataUrl] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [imageLoadError, setImageLoadError] = useState<string | null>(null)
  const [imageUseProtocol, setImageUseProtocol] = useState(true)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const nodeRootRef = useRef<HTMLDivElement>(null)
  const colorPickerAnchorRef = useRef<HTMLDivElement>(null)
  const [colorPickerRect, setColorPickerRect] = useState<{ left: number; top: number } | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const lastResizedForPreviewRef = useRef<string | null>(null)
  
  const { activeThemeId, customThemes } = useSettings()
  const allThemes = [...PRESET_THEMES, ...customThemes]
  const activeTheme = allThemes.find((t) => t.id === activeThemeId) || PRESET_THEMES[0]
  const isDarkTheme = activeTheme.colors.bgBase === '#000000' || activeTheme.colors.bgBase < '#333333'
  
  const excalidrawData = useMemo(() => {
    if (filePreviewType !== 'excalidraw' || !filePreview) return null
    try {
      const parsed = JSON.parse(filePreview)
      const elements = parsed.elements || []
      
      let scrollX = 0
      let scrollY = 0
      let zoom = 1
      
      if (elements.length > 0) {
        const xs = elements.map((e: any) => e.x || 0)
        const ys = elements.map((e: any) => e.y || 0)
        const widths = elements.map((e: any) => (e.x || 0) + (e.width || 100))
        const heights = elements.map((e: any) => (e.y || 0) + (e.height || 100))
        
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...widths)
        const maxY = Math.max(...heights)
        
        const contentWidth = maxX - minX + 40
        const contentHeight = maxY - minY + 40
        
        const availWidth = node.width - 24
        const availHeight = node.height - 52
        
        const scaleX = availWidth / contentWidth
        const scaleY = availHeight / contentHeight
        zoom = Math.min(scaleX, scaleY, 1) * 0.9
        
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        scrollX = -centerX + availWidth / (2 * zoom)
        scrollY = -centerY + availHeight / (2 * zoom)
      }
      
      return {
        elements,
        appState: {
          viewBackgroundColor: 'transparent',
          ...(parsed.appState || {}),
          collaborators: new Map(),
          zoom: { value: zoom },
          scrollX,
          scrollY,
        },
        files: parsed.files || {},
        scrollToContent: true,
      }
    } catch {
      return null
    }
  }, [filePreviewType, filePreview, node.width, node.height])
  const imageSizedForRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!showColorPicker || !colorPickerAnchorRef.current || !nodeRootRef.current) {
      setColorPickerRect(null)
      return
    }
    const anchorRect = colorPickerAnchorRef.current.getBoundingClientRect()
    const nodeRect = nodeRootRef.current.getBoundingClientRect()
    setColorPickerRect({
      left: anchorRect.right + 16,
      top: nodeRect.top
    })
  }, [showColorPicker])

  useEffect(() => {
    if (!showColorPicker) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (colorPickerAnchorRef.current?.contains(target)) return
      if (document.querySelector('.canvas-node-color-picker-floating')?.contains(target)) return
      setShowColorPicker(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showColorPicker])

  const canEdit = node.type === 'text' || node.type === 'link' || node.type === 'file'

  const formattedHtml = useMemo(() => {
    const raw = node.type === 'text' ? node.content : (node.type === 'file' && filePreview ? filePreview : '')
    if (!raw) return ''
    if (node.type === 'file' && (filePreviewType === 'code' || filePreviewType === 'yaml') && node.content) {
      const ext = node.content.replace(/^.*\./, '').toLowerCase()
      const lang = filePreviewType === 'yaml' ? 'yaml' : (CODE_EXTENSIONS[ext] ?? 'plaintext')
      try {
        const result = hljs.highlight(raw, { language: lang })
        return DOMPurify.sanitize('<pre><code class="hljs">' + result.value + '</code></pre>', { ADD_TAGS: ['pre', 'code', 'span'], ADD_ATTR: ['class'] })
      } catch {
        return DOMPurify.sanitize('<pre><code>' + escapeHtml(raw) + '</code></pre>', { ADD_TAGS: ['pre', 'code'] })
      }
    }
    const parsed = marked.parse(raw) as string
    return DOMPurify.sanitize(parsed, { ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked'] })
  }, [node.type, node.content, filePreview, filePreviewType])

  // Use parent-provided file preview when available (Canvas loads and passes down)
  useEffect(() => {
    if (node.type !== 'file') {
      setFilePreview(null)
      setFilePreviewType(null)
      return
    }
    if (filePreviewError) {
      setFilePreview(null)
      setFilePreviewType('error')
      return
    }
    if (filePreviewContent != null) {
      const path = node.content?.trim() ?? ''
      if (PDF_RE.test(path)) {
        setFilePreview(null)
        setFilePreviewType('plain')
        return
      }
      if (EXCALIDRAW_RE.test(path)) {
        setFilePreviewType('excalidraw')
        setFilePreview(filePreviewContent)
        return
      }
      if (CSV_RE.test(path)) {
        setFilePreviewType('csv')
        setFilePreview(filePreviewContent)
      } else if (YAML_RE.test(path)) {
        setFilePreviewType('yaml')
        setFilePreview(filePreviewContent.slice(0, 2000))
      } else if (CODE_EXT_RE.test(path)) {
        setFilePreviewType('code')
        setFilePreview(filePreviewContent.slice(0, 3000))
      } else if (MARKDOWN_RE.test(path)) {
        setFilePreviewType('markdown')
        setFilePreview(filePreviewContent.trim())
      } else {
        // Heuristic: treat mostly-binary content as non-text → no preview
        const sample = filePreviewContent.slice(0, 400)
        const nonPrintable = sample.split('').filter((ch) => {
          const code = ch.charCodeAt(0)
          return (code < 9 || (code > 13 && code < 32)) || ch === '\uFFFD'
        }).length
        const ratio = nonPrintable / Math.max(sample.length, 1)
        if (ratio > 0.15) {
          setFilePreview(null)
          setFilePreviewType('error')
        } else {
          setFilePreviewType('plain')
          setFilePreview(sample.trim())
        }
      }
      return
    }
    setFilePreview(null)
    setFilePreviewType(null)
  }, [node.type, node.content, filePreviewContent, filePreviewError])

  useEffect(() => {
    if (node.type === 'link' && node.content && /^https?:\/\//i.test(node.content)) {
      let cancelled = false
      if (window.asterisk?.fetchUrlText) {
        window.asterisk.fetchUrlText(node.content).then((r) => {
          if (cancelled) return
          if (!r.ok || !r.data?.text) {
            setLinkPreview(null)
            return
          }
          const doc = new DOMParser().parseFromString(r.data.text, 'text/html')
          const getMeta = (name: string) => doc.querySelector(`meta[property="og:${name}"], meta[name="${name}"]`)?.getAttribute('content')
          setLinkPreview({
            title: getMeta('title') ?? undefined,
            description: getMeta('description') ?? undefined,
            image: getMeta('image') ?? undefined
          })
        }).catch(() => setLinkPreview(null))
      } else {
        setLinkPreview(null)
      }
      return () => { cancelled = true }
    }
    setLinkPreview(null)
    setLinkPreviewImageDataUrl(null)
  }, [node.type, node.content])

  useEffect(() => {
    const imageUrl = linkPreview?.image
    if (!imageUrl || !window.asterisk?.fetchImageDataUrl) {
      setLinkPreviewImageDataUrl(null)
      return
    }
    let cancelled = false
    window.asterisk.fetchImageDataUrl(imageUrl).then((r) => {
      if (cancelled) return
      if (r.ok && r.data?.dataUrl) setLinkPreviewImageDataUrl(r.data.dataUrl)
      else setLinkPreviewImageDataUrl(null)
    }).catch(() => {
      if (!cancelled) setLinkPreviewImageDataUrl(null)
    })
    return () => { cancelled = true }
  }, [linkPreview?.image])

  useEffect(() => {
    if (isEditing) {
      setEditValue(node.content)
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [isEditing, node.content])

  useEffect(() => {
    setTitleValue(node.title ?? '')
  }, [node.title])

  useEffect(() => {
    if (node.type !== 'image' || !node.content) {
      setImageDataUrl(null)
      setImageLoadFailed(false)
      setImageLoadError(null)
      imageSizedForRef.current = null
      return
    }
    const raw = node.content.replace(/^file:\/\/+/i, '').replace(/^\/([A-Za-z]:)/, '$1').trim()
    if (!raw || raw.startsWith('http')) {
      setImageDataUrl(null)
      setImageLoadFailed(false)
      setImageLoadError(null)
      return
    }
    setImageDataUrl(null)
    setImageLoadFailed(false)
    setImageLoadError(null)
    setImageUseProtocol(false)
  }, [node.type, node.content, workspacePath])

  useEffect(() => {
    if (node.type !== 'image' || !node.content || imageUseProtocol || !window.asterisk?.readImageAsDataUrl) return
    const raw = node.content.replace(/^file:\/\/+/i, '').replace(/^\/([A-Za-z]:)/, '$1').trim()
    if (!raw || raw.startsWith('http')) return
    const abs = (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)) ? raw.replace(/\\/g, '/') : (workspacePath ? resolveImagePath(workspacePath, raw) : raw)
    let cancelled = false
    window.asterisk.readImageAsDataUrl(abs).then((r) => {
      if (cancelled) return
      const data = r?.ok ? r?.data?.dataUrl : null
      const valid = typeof data === 'string' && data.startsWith('data:') && data.length > 100
      if (valid) {
        setImageDataUrl(data)
        setImageLoadFailed(false)
        setImageLoadError(null)
      } else {
        setImageLoadFailed(true)
        setImageLoadError(r?.error ?? 'Failed to load')
      }
    }).catch((err) => {
      if (!cancelled) {
        setImageLoadFailed(true)
        setImageLoadError(err?.message ?? 'Failed to load')
      }
    })
    return () => { cancelled = true }
  }, [node.type, node.content, workspacePath, imageUseProtocol])

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus()
  }, [isEditingTitle])

  useEffect(() => {
    const upd = onUpdateRef.current
    if (!upd || isEditing || node.type === 'image' || node.type === 'group') return
    const el = contentRef.current
    if (!el) return
    if (node.type === 'file') {
      if (!filePreview) {
        lastResizedForPreviewRef.current = null
        return
      }
      if (lastResizedForPreviewRef.current === filePreview) return
      lastResizedForPreviewRef.current = filePreview
    }
    const contentHeight = el.scrollHeight
    const total = NODE_HEADER_HEIGHT + NODE_CONTENT_PADDING + contentHeight
    const clamped = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, Math.ceil(total)))
    const updates: Partial<CanvasNodeType> = {}
    if (clamped !== node.height) updates.height = clamped
    if (node.type === 'file' && filePreview && node.width < 280) updates.width = Math.max(node.width, 280)
    if (Object.keys(updates).length) upd(updates)
    // Omit node.height / node.width from deps to avoid loop: updating them would re-run and re-update
  }, [node.content, node.type, node.width, isEditing, filePreview])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh || !onUpdate) return
    if (imageSizedForRef.current === node.content) return
    imageSizedForRef.current = node.content
    const scale = Math.min(IMAGE_NODE_MAX_WIDTH / nw, IMAGE_NODE_MAX_HEIGHT / nh, 1)
    const w = Math.round(nw * scale)
    const h = Math.round(nh * scale)
    const nodeW = Math.max(NODE_DEFAULT_WIDTH, w)
    const nodeH = NODE_HEADER_HEIGHT + NODE_CONTENT_PADDING + h + NODE_CONTENT_PADDING
    onUpdate({ width: nodeW, height: nodeH })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('.canvas-node-resize-handle')) return
    if (e.button !== 0) return
    if (connectionMode && (moveMode ? e.shiftKey : true) && onShiftClick) {
      onShiftClick()
      return
    }
    if (moveMode) {
      onSelect(e.ctrlKey || e.metaKey)
      didDragRef.current = false
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    if (connectionMode && onShiftClick) {
      onShiftClick()
      return
    }
    onSelect(e.ctrlKey || e.metaKey)
    didDragRef.current = false
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(false)
    setIsResizing(true)
    resizeStartRef.current = { w: node.width, h: node.height, x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  // End resize when pointer is released or cancelled anywhere (e.g. click away, or over iframe)
  useEffect(() => {
    if (!isResizing) return
    const endResize = () => setIsResizing(false)
    document.addEventListener('pointerup', endResize)
    document.addEventListener('pointercancel', endResize)
    return () => {
      document.removeEventListener('pointerup', endResize)
      document.removeEventListener('pointercancel', endResize)
    }
  }, [isResizing])

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isResizing) {
      const { w, h, x, y } = resizeStartRef.current
      const dw = e.clientX - x
      const dh = e.clientY - y
      const newW = Math.max(100, w + dw)
      const newH = Math.max(NODE_MIN_HEIGHT, h + dh)
      onResize?.(newW, newH)
      resizeStartRef.current = { w: newW, h: newH, x: e.clientX, y: e.clientY }
      return
    }
    if (!isDragging) return
    didDragRef.current = true
    onDrag(e.clientX - dragStart.x, e.clientY - dragStart.y)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button === 0) {
      if (isDragging && didDragRef.current && onDragEnd) onDragEnd()
      setIsDragging(false)
      setIsResizing(false)
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (moveMode) return
    if (canEdit) {
      setIsEditing(true)
    }
    onDoubleClick()
  }

  const commitEdit = () => {
    if (editValue !== node.content) {
      onContentChange?.(editValue)
    }
    setIsEditing(false)
  }

  const cancelEdit = () => {
    setEditValue(node.content)
    setIsEditing(false)
  }

  const commitTitle = () => {
    const t = titleValue.trim()
    if (t !== (node.title ?? '')) onTitleChange?.(t || '')
    setIsEditingTitle(false)
  }

  const displayTitle = (node.title?.trim() || getCardTitle(node)).slice(0, 48)
  const borderColor = node.color ?? 'var(--border)'
  const bg = node.backgroundColor ?? 'var(--bg-elevated)'
  const textContrast = getContrastColor(bg)

  const contentAreaWidth = node.width - 24
  const contentAreaHeight = node.height - 28 - 24
  const embedScale = Math.max(
    contentAreaWidth / 800,
    contentAreaHeight / 600
  )
  const cardScale = Math.min(
    contentAreaWidth / 320,
    contentAreaHeight / 240,
    1
  )

  return (
    <div
      ref={nodeRootRef}
      className={`canvas-node${textContrast ? ' canvas-node-custom-bg' : ''}${isResizing ? ' canvas-node-resizing' : ''}${moveMode ? ' canvas-node-move-mode' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        borderColor,
        backgroundColor: bg,
        color: textContrast || undefined,
        boxShadow: selected ? `0 0 0 2px var(--accent)` : undefined
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="canvas-node-header" style={{ borderColor, color: textContrast || undefined }}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            className="canvas-node-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') { setTitleValue(node.title ?? ''); setIsEditingTitle(false) }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="canvas-node-title-text"
            onClick={(e) => { e.stopPropagation(); if (!moveMode) setIsEditingTitle(true) }}
            title={moveMode ? undefined : 'Click to edit title'}
          >
            {displayTitle}
          </span>
        )}
        {onUpdate && !moveMode && (
          <div className="canvas-node-header-actions" ref={colorPickerAnchorRef}>
            <button
              type="button"
              className="canvas-node-color-btn"
              style={{ backgroundColor: node.backgroundColor ?? 'var(--bg-elevated)' }}
              onClick={(e) => { e.stopPropagation(); setShowColorPicker(showColorPicker === 'bg' ? false : 'bg') }}
              title="Background color"
            />
            <button
              type="button"
              className="canvas-node-color-btn canvas-node-color-btn-border"
              style={{ borderColor: node.color ?? 'var(--border)' }}
              onClick={(e) => { e.stopPropagation(); setShowColorPicker(showColorPicker === 'border' ? false : 'border') }}
              title="Border color"
            />
            {colorPickerRect && createPortal(
              <div
                className="canvas-node-color-picker canvas-node-color-picker-floating"
                style={{ position: 'fixed', left: colorPickerRect.left, top: colorPickerRect.top, zIndex: 9999 }}
                onClick={(e) => e.stopPropagation()}
              >
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="canvas-node-color-swatch"
                    style={{ backgroundColor: showColorPicker === 'border' ? 'transparent' : c, borderColor: c, borderWidth: showColorPicker === 'border' ? 2 : 1 }}
                    onClick={() => {
                      if (showColorPicker === 'bg') onUpdate({ backgroundColor: c })
                      else onUpdate({ color: c })
                      setShowColorPicker(false)
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="canvas-node-color-reset"
                  onClick={() => {
                    if (showColorPicker === 'bg') onUpdate({ backgroundColor: undefined })
                    else onUpdate({ color: undefined })
                    setShowColorPicker(false)
                  }}
                >
                  Reset
                </button>
              </div>,
              document.body
            )}
          </div>
        )}
      </div>
      <div ref={contentRef} className="canvas-node-content" style={{ color: textContrast || undefined }}>
        {node.type === 'text' && (
          isEditing ? (
            <textarea
              ref={editInputRef}
              className="canvas-node-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitEdit()
                } else if (e.key === 'Escape') {
                  cancelEdit()
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            node.content
              ? (
                <div
                  className="canvas-node-markdown"
                  dangerouslySetInnerHTML={{ __html: formattedHtml }}
                />
                )
              : (
                <span className="canvas-node-placeholder">Double-click to edit</span>
                )
          )
        )}
        {node.type === 'file' && (
          isEditing ? (
            <textarea
              ref={editInputRef}
              className="canvas-node-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit()
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : /\.pdf$/i.test(node.content ?? '') ? (
            <div className="canvas-node-pdf-wrap">
              <iframe
                title="PDF"
                src={`${asteriskFileUrl(resolveFilePath(workspacePath, node.content ?? ''))}#toolbar=0`}
                className="canvas-node-pdf"
              />
            </div>
          ) : filePreviewType === 'excalidraw' && excalidrawData ? (
            <div 
              className="canvas-node-excalidraw-wrap" 
              onPointerDown={(e) => e.stopPropagation()}
              style={{ height: node.height - 52 }}
            >
              <Excalidraw
                key={`${node.id}-${node.width}-${node.height}`}
                initialData={excalidrawData}
                theme={isDarkTheme ? THEME.DARK : THEME.LIGHT}
                viewModeEnabled={true}
                zenModeEnabled={true}
                gridModeEnabled={false}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    export: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                    clearCanvas: false,
                    changeViewBackgroundColor: false,
                  },
                  tools: { image: false },
                }}
              />
            </div>
          ) : (
            <div className="canvas-node-file-wrap">
              {filePreviewType === 'error' ? (
                <div className="canvas-node-preview canvas-node-preview-error">Preview unavailable</div>
              ) : filePreview === null && node.content ? (
                <div className="canvas-node-preview canvas-node-preview-loading">Loading…</div>
              ) : filePreview
                ? filePreviewType === 'csv'
                  ? (
                      <div className="canvas-node-csv-wrap">
                        <table className="canvas-node-csv-table">
                          <tbody>
                            {filePreview.split(/\r?\n/).filter(Boolean).slice(0, 15).map((line, i) => {
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
                    )
                  : filePreviewType === 'markdown'
                    ? (
                        <div
                          className="canvas-node-markdown canvas-node-preview"
                          dangerouslySetInnerHTML={{ __html: formattedHtml }}
                        />
                      )
                    : filePreviewType === 'code' || filePreviewType === 'yaml'
                    ? (
                        <div
                          className="canvas-node-code-preview canvas-node-preview"
                          dangerouslySetInnerHTML={{ __html: formattedHtml }}
                        />
                      )
                    : filePreviewType === 'plain'
                      ? (
                          <pre className="canvas-node-plain-preview canvas-node-preview">{filePreview}</pre>
                        )
                      : (
                          <div
                            className="canvas-node-markdown canvas-node-preview"
                            dangerouslySetInnerHTML={{ __html: formattedHtml }}
                          />
                        )
                : null}
            </div>
          )
        )}
        {node.type === 'link' && (
          isEditing ? (
            <textarea
              ref={editInputRef}
              className="canvas-node-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit()
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : node.content && node.embed !== false ? (
            <div className="canvas-node-embed-wrap">
              <div
                className="canvas-node-embed-scaler"
                style={{
                  width: 800,
                  height: 600,
                  transform: `scale(${embedScale})`,
                  transformOrigin: '0 0'
                }}
              >
                <iframe
                  title="Embedded content"
                  src={getYouTubeEmbedUrl(node.content) ?? node.content}
                  className="canvas-node-embed-iframe"
                />
              </div>
              <div className="canvas-node-embed-actions">
                {window.asterisk?.openExternalUrl && (
                  <a
                    href={node.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="canvas-node-embed-open-browser"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.asterisk?.openExternalUrl(node.content ?? '')
                    }}
                  >
                    Can't embed? Open in browser
                  </a>
                )}
                {onUpdate && (
                  <button
                    type="button"
                    className="canvas-node-embed-toggle"
                    onClick={(e) => { e.stopPropagation(); onUpdate({ embed: false }) }}
                    title="Show as card"
                  >
                    Show as card
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="canvas-node-link-wrap">
              <div
                className="canvas-node-link-scaler"
                style={{
                  width: 320,
                  height: 240,
                  transform: `scale(${cardScale})`,
                  transformOrigin: '0 0'
                }}
              >
                {onUpdate && node.content && (
                  <button
                    type="button"
                    className="canvas-node-link-embed-btn"
                    onClick={(e) => { e.stopPropagation(); onUpdate({ embed: true }) }}
                    title="Embed in frame (website or YouTube)"
                  >
                    Embed
                  </button>
                )}
                {linkPreview?.image && (
                  <div className="canvas-node-link-image">
                    <img src={linkPreviewImageDataUrl ?? linkPreview.image} alt="" draggable={false} />
                  </div>
                )}
                <div className="canvas-node-link-body">
                  {linkPreview?.title && <div className="canvas-node-link-title">{linkPreview.title}</div>}
                  {linkPreview?.description && <div className="canvas-node-link-desc">{linkPreview.description}</div>}
                  <a
                    href={node.content || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="canvas-node-link-url"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {node.content || 'URL'}
                  </a>
                </div>
              </div>
            </div>
          )
        )}
        {node.type === 'image' && (
          <div className="canvas-node-image">
            {node.content?.startsWith('http') ? (
              <img
                src={node.content}
                alt=""
                draggable={false}
                loading="lazy"
                onLoad={handleImageLoad}
                onError={() => { setImageLoadFailed(true); setImageLoadError('Failed to load') }}
              />
            ) : imageDataUrl ? (
              <img src={imageDataUrl} alt="" draggable={false} loading="lazy" onLoad={handleImageLoad} />
            ) : node.content ? (
              imageLoadFailed ? (
                <span className="canvas-node-image-loading" title={imageLoadError || undefined}>
                  {imageLoadError || 'Failed to load image'}
                </span>
              ) : imageUseProtocol ? (
                <img
                  src={asteriskFileUrl(
                    (node.content.startsWith('/') || /^[A-Za-z]:[\\/]/.test(node.content))
                      ? node.content.replace(/\\/g, '/')
                      : (workspacePath ? resolveImagePath(workspacePath, node.content) : node.content)
                  )}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  onLoad={handleImageLoad}
                  onError={() => {
                    setImageUseProtocol(false)
                    const abs = (node.content.startsWith('/') || /^[A-Za-z]:[\\/]/.test(node.content))
                      ? node.content.replace(/\\/g, '/')
                      : (workspacePath ? resolveImagePath(workspacePath, node.content) : node.content)
                    window.asterisk?.readImageAsDataUrl(abs).then((r) => {
                      const raw = r?.ok ? r?.data?.dataUrl : null
                      const valid = typeof raw === 'string' && raw.startsWith('data:image') && raw.length > 50
                      if (valid) {
                        setImageDataUrl(raw)
                        setImageLoadFailed(false)
                        setImageLoadError(null)
                      } else {
                        setImageLoadFailed(true)
                        setImageLoadError(r?.error ?? 'Failed to load')
                      }
                    }).catch((err) => {
                      setImageLoadFailed(true)
                      setImageLoadError(err?.message ?? 'Failed to load')
                    })
                  }}
                />
              ) : (
                <span className="canvas-node-image-loading">Loading…</span>
              )
            ) : (
              <span>Drop image file or paste URL</span>
            )}
          </div>
        )}
      </div>
      {onResize && !moveMode && (
        <div
          className="canvas-node-resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      )}
    </div>
  )
}
