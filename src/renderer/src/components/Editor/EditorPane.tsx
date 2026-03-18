import { useEffect, useRef, useState, useCallback } from 'react'
import { Star, Maximize2, Minimize2, FileX, Eye, Columns2 } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import { useSettings } from '../../store/useSettings'
import { useCodeMirror } from './useCodeMirror'
import EditorContextMenu from './EditorContextMenu'
import NoteDatePicker from '../Calendar/NoteDatePicker'
import ImagePreview from './ImagePreview'
import './CommandSuggestionPanel.css'
import './EditorPane.css'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif', 'avif']
function isImageFileName(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop()
  return !!ext && IMAGE_EXTS.includes(ext)
}

export default function EditorPane() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const markSaved = useWorkspace((s) => s.markSaved)
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark)
  const { editorMode, setEditorMode } = useSettings()
  const filePathRef = useRef<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  filePathRef.current = openFile?.path ?? null

  const showImagePreview = openFile && isImageFileName(openFile.name)
  const isMdFile = openFile && /\.(md|markdown)$/i.test(openFile.name)

  const toggleFullscreen = useCallback(() => {
    const el = paneRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'F11' || (e.metaKey && e.shiftKey && e.key === 'f')) && paneRef.current?.contains(document.activeElement ?? null)) {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleFullscreen])

  async function handleSave() {
    if (!openFile) return
    const result = await window.asterisk.writeFile(openFile.path, openFile.content)
    if (result.ok) markSaved()
  }

  const { containerRef, viewRef, updateContent: syncEditorContent } = useCodeMirror({
    onChange: updateContent,
    onSave: handleSave,
    getCurrentFilePath: () => filePathRef.current,
    onToggleBookmark: openFile ? () => toggleBookmark(openFile.path) : undefined
  })

  // Sync content whenever the open file path changes (file switch)
  useEffect(() => {
    syncEditorContent(openFile?.content ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile?.path])

  // Sync content when openFile.content changes (e.g. after AI apply) so editor updates without reopening
  useEffect(() => {
    if (!openFile?.path) return
    syncEditorContent(openFile.content ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile?.content])

  const fileName = openFile?.name ?? ''
  const fileExt = fileName.includes('.') ? fileName.split('.').pop() : ''
  const fileBase = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName

  return (
    <div ref={paneRef} className={`editor-pane ${isFullscreen ? 'editor-pane-fullscreen' : ''}`}>
      {/* File header — always present when file is open */}
      <div className={`editor-header ${openFile ? 'visible' : ''}`}>
        {openFile && (
          <>
            {openFile.fileType === 'text' && (
              <button
                type="button"
                className={`editor-header-bookmark ${bookmarks.includes(openFile.path) ? 'active' : ''}`}
                onClick={() => toggleBookmark(openFile.path)}
                title={bookmarks.includes(openFile.path) ? 'Remove bookmark' : 'Bookmark this note'}
                aria-label={bookmarks.includes(openFile.path) ? 'Remove bookmark' : 'Bookmark'}
              >
                <Star size={14} strokeWidth={1.7} />
              </button>
            )}
            <span className="editor-header-name">{fileBase}</span>
            {fileExt && <span className="editor-header-ext">.{fileExt}</span>}
            <span className="editor-header-spacer" />
            {openFile.fileType === 'text' && <NoteDatePicker filePath={openFile.path} />}
            {isMdFile && (
              <button
                type="button"
                className={`editor-header-mode ${editorMode === 'split-view' ? 'split' : ''}`}
                onClick={() => setEditorMode(editorMode === 'live-preview' ? 'split-view' : 'live-preview')}
                title={editorMode === 'live-preview' ? 'Switch to Split View' : 'Switch to Live Preview'}
                aria-label={editorMode === 'live-preview' ? 'Switch to Split View' : 'Switch to Live Preview'}
              >
                {editorMode === 'live-preview' ? <Eye size={14} strokeWidth={1.7} /> : <Columns2 size={14} strokeWidth={1.7} />}
              </button>
            )}
            <button
              type="button"
              className="editor-header-fullscreen"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen (⌘⇧F)' : 'Fullscreen editor (⌘⇧F)'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen editor'}
            >
              {isFullscreen ? <Minimize2 size={14} strokeWidth={1.7} /> : <Maximize2 size={14} strokeWidth={1.7} />}
            </button>
          </>
        )}
      </div>

      {/*
        CRITICAL: This div must ALWAYS be in the DOM.
        CodeMirror attaches to containerRef.current on mount (useEffect []).
        If we conditionally render it, containerRef.current is null when the
        effect runs and the editor never initializes.
      */}
      {/* CodeMirror editor - hidden when showing image or binary */}
      <div
        ref={containerRef}
        className="editor-cm-wrapper"
        style={{
          display: openFile && !showImagePreview && openFile.fileType !== 'binary' ? 'flex' : 'none'
        }}
      />

      {/* Right-click formatting context menu */}
      <EditorContextMenu editorView={viewRef.current} />

      {/* Image preview: loads image via IPC so it works in dev and production */}
      {showImagePreview && (
        <div className="editor-image-preview-wrap" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <ImagePreview filePath={openFile.path} fileName={openFile.name} />
        </div>
      )}

      {/* Binary file - no preview available (never for image-by-extension) */}
      {openFile?.fileType === 'binary' && !isImageFileName(openFile.name) && (
        <div className="editor-binary-preview">
          <FileX size={48} strokeWidth={1.2} />
          <p>Preview unavailable</p>
          <span className="editor-binary-hint">{openFile.name}</span>
        </div>
      )}

      {/* Empty state — shown when no file is open */}
      {!openFile && (
        <div className="editor-pane-empty">
          <div className="editor-pane-empty-mark">✱</div>
          <h2>Asterisk</h2>
          <p>Open a folder, then select a note.</p>
        </div>
      )}
    </div>
  )
}
