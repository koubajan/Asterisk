import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, FilePlus, FolderPlus, Tag, Plus, Check, X, LayoutGrid, PenLine } from 'lucide-react'
import type { FolderNode } from '../../types'
import { useWorkspace, TAG_COLORS } from '../../store/useWorkspace'

interface ContextMenuProps {
  node: FolderNode | null
  x: number
  y: number
  onClose: () => void
  onRename?: () => void
  onDelete?: () => void
  onToggleTag?: (tagId: string) => void
  onNewFile: (dirPath: string) => void
  onNewFolder: (dirPath: string) => void
  onNewCanvas?: (dirPath: string) => void
  onNewExcalidraw?: (dirPath: string) => void
  rootPath: string
}

export default function ContextMenu({
  node, x, y, onClose, onRename, onDelete, onToggleTag, onNewFile, onNewFolder, onNewCanvas, onNewExcalidraw, rootPath
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const newTagInputRef = useRef<HTMLInputElement>(null)

  const customTags      = useWorkspace((s) => s.customTags)
  const fileTags        = useWorkspace((s) => s.fileTags)
  const addCustomTag    = useWorkspace((s) => s.addCustomTag)
  const deleteCustomTag = useWorkspace((s) => s.deleteCustomTag)

  const [showNewTag, setShowNewTag]   = useState(false)
  const [newTagName, setNewTagName]   = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[4])

  const nodeTagIds = node ? (fileTags[node.path] ?? []) : []

  useEffect(() => {
    if (showNewTag) setTimeout(() => newTagInputRef.current?.focus(), 30)
  }, [showNewTag])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menuWidth = 200
  const menuHeight = node ? 400 : 160
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const adjustedX = x + menuWidth > viewportWidth - 8 ? x - menuWidth : x
  const adjustedY = y + menuHeight > viewportHeight - 8 ? Math.max(8, viewportHeight - menuHeight - 8) : y

  const createDir = node?.kind === 'folder' ? node.path : rootPath

  function handleCreateTag(e: React.FormEvent) {
    e.preventDefault()
    const name = newTagName.trim()
    if (!name) return
    addCustomTag(name, newTagColor)
    setShowNewTag(false)
    setNewTagName('')
    setNewTagColor(TAG_COLORS[4])
  }

  return createPortal(
    <div ref={ref} className="context-menu" style={{ left: adjustedX, top: adjustedY }}>
      <button className="context-menu-item" onClick={() => { onNewFile(createDir); onClose() }}>
        <FilePlus size={13} strokeWidth={1.7} /> New File
      </button>
      <button className="context-menu-item" onClick={() => { onNewFolder(createDir); onClose() }}>
        <FolderPlus size={13} strokeWidth={1.7} /> New Folder
      </button>
      {onNewCanvas && (
        <button className="context-menu-item" onClick={() => { onNewCanvas(rootPath); onClose() }}>
          <LayoutGrid size={13} strokeWidth={1.7} /> New Artifact
        </button>
      )}
      {onNewExcalidraw && (
        <button className="context-menu-item" onClick={() => { onNewExcalidraw(rootPath); onClose() }}>
          <PenLine size={13} strokeWidth={1.7} /> New Excalidraw Drawing
        </button>
      )}

      {node && (
        <>
          <div className="context-menu-separator" />
          {onRename && (
            <button className="context-menu-item" onClick={() => { onRename(); onClose() }}>
              <Pencil size={13} strokeWidth={1.7} /> Rename
            </button>
          )}
          {onDelete && (
            <button
              className="context-menu-item danger"
              onClick={() => {
                const label = node.kind === 'folder'
                  ? `folder "${node.name}" and all its contents`
                  : `"${node.name}"`
                if (window.confirm(`Delete ${label}? This cannot be undone.`)) onDelete()
                onClose()
              }}
            >
              <Trash2 size={13} strokeWidth={1.7} /> Delete
            </button>
          )}

          <div className="context-menu-separator" />
          <div className="ctx-tag-header">
            <Tag size={11} strokeWidth={1.7} /> Tags
          </div>

          <div className="ctx-tag-list">
            {customTags.length === 0 && !showNewTag && (
              <div className="ctx-tag-empty">No tags yet</div>
            )}
            {customTags.map((tag) => {
              const active = nodeTagIds.includes(tag.id)
              return (
                <div key={tag.id} className="ctx-tag-row">
                  <button
                    className={`context-menu-item ctx-tag-item ${active ? 'ctx-tag-active' : ''}`}
                    onClick={() => onToggleTag?.(tag.id)}
                  >
                    <span className="ctx-tag-dot" style={{ background: tag.color }} />
                    <span className="ctx-tag-name">{tag.name}</span>
                    {active && <Check size={10} strokeWidth={2.5} className="ctx-tag-check" />}
                  </button>
                  <button
                    className="ctx-tag-delete"
                    title={`Delete tag "${tag.name}"`}
                    onClick={(e) => { e.stopPropagation(); deleteCustomTag(tag.id) }}
                  >
                    <X size={10} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>

          {showNewTag ? (
            <form className="ctx-new-tag-form" onSubmit={handleCreateTag}>
              <input
                ref={newTagInputRef}
                className="ctx-new-tag-input"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowNewTag(false); setNewTagName('') }
                }}
                placeholder="Tag name…"
                maxLength={24}
              />
              <div className="ctx-new-tag-colors">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`ctx-color-dot ${newTagColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
              <div className="ctx-new-tag-actions">
                <button type="submit" className="ctx-new-tag-btn primary" disabled={!newTagName.trim()}>
                  Add tag
                </button>
                <button type="button" className="ctx-new-tag-btn"
                  onClick={() => { setShowNewTag(false); setNewTagName('') }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="context-menu-item" onClick={() => setShowNewTag(true)}>
              <Plus size={12} strokeWidth={1.7} /> New tag
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  )
}
