import { useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import { useCodeMirror } from './useCodeMirror'
import EditorContextMenu from './EditorContextMenu'
import './EditorPane.css'

export default function EditorPane() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const markSaved = useWorkspace((s) => s.markSaved)
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark)
  const filePathRef = useRef<string | null>(null)
  filePathRef.current = openFile?.path ?? null

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

  const fileName = openFile?.name ?? ''
  const fileExt = fileName.includes('.') ? fileName.split('.').pop() : ''
  const fileBase = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName

  return (
    <div className="editor-pane">
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
            <span className={`editor-header-status ${openFile.isDirty ? 'dirty' : ''}`}>
              {openFile.isDirty ? '●' : '○'}
            </span>
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
          <p>Open a folder and select a note to start writing.</p>
          <div className="editor-pane-empty-keys">
            <span><kbd>⌘B</kbd> bold</span>
            <span><kbd>⌘I</kbd> italic</span>
            <span><kbd>⌘K</kbd> link</span>
            <span><kbd>⌘S</kbd> save</span>
          </div>
        </div>
      )}
    </div>
  )
}
