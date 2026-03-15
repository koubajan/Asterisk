import { useEffect, useRef, useState, useCallback } from 'react'
import { Star, Maximize2, Minimize2 } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import { useCodeMirror } from './useCodeMirror'
import EditorContextMenu from './EditorContextMenu'
import NoteDatePicker from '../Calendar/NoteDatePicker'
import './CommandSuggestionPanel.css'
import './EditorPane.css'

export default function EditorPane() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const markSaved = useWorkspace((s) => s.markSaved)
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark)
  const filePathRef = useRef<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  filePathRef.current = openFile?.path ?? null

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
            <button
              type="button"
              className={`editor-header-bookmark ${bookmarks.includes(openFile.path) ? 'active' : ''}`}
              onClick={() => toggleBookmark(openFile.path)}
              title={bookmarks.includes(openFile.path) ? 'Remove bookmark' : 'Bookmark this note'}
              aria-label={bookmarks.includes(openFile.path) ? 'Remove bookmark' : 'Bookmark'}
            >
              <Star size={14} strokeWidth={1.7} />
            </button>
            <span className="editor-header-name">{fileBase}</span>
            {fileExt && <span className="editor-header-ext">.{fileExt}</span>}
            <span className="editor-header-spacer" />
            <NoteDatePicker filePath={openFile.path} />
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
      <div
        ref={containerRef}
        className="editor-cm-wrapper"
        style={{ display: openFile ? 'flex' : 'none' }}
      />

      {/* Right-click formatting context menu */}
      <EditorContextMenu editorView={viewRef.current} />

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
