import { useEffect, useRef, useState } from 'react'
import { Trash2, FolderPlus, FolderMinus, ChevronRight } from 'lucide-react'

interface GroupOption {
  id: string
  title: string
}

interface CanvasContextMenuProps {
  x: number
  y: number
  nodeId?: string
  edgeId?: string
  groups?: GroupOption[]
  currentGroupId?: string
  onClose: () => void
  onDelete?: (nodeId: string) => void
  onDeleteEdge?: (edgeId: string) => void
  onAddToGroup?: (nodeId: string, groupId: string) => void
  onRemoveFromGroup?: (nodeId: string, groupId: string) => void
}

export default function CanvasContextMenu({ x, y, nodeId, edgeId, groups, currentGroupId, onClose, onDelete, onDeleteEdge, onAddToGroup, onRemoveFromGroup }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showGroupSubmenu, setShowGroupSubmenu] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const hasGroups = groups && groups.length > 0

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {edgeId && onDeleteEdge ? (
        <button
          type="button"
          className="canvas-context-menu-item"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteEdge(edgeId); onClose() }}
        >
          <Trash2 size={14} strokeWidth={1.7} />
          <span>Delete connection</span>
        </button>
      ) : nodeId ? (
        <>
          {currentGroupId && onRemoveFromGroup && (
            <button
              type="button"
              className="canvas-context-menu-item"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemoveFromGroup(nodeId, currentGroupId)
                onClose()
              }}
            >
              <FolderMinus size={14} strokeWidth={1.7} />
              <span>Remove from group</span>
            </button>
          )}
          {hasGroups && onAddToGroup && (
            <div
              className="canvas-context-menu-item canvas-context-menu-item-submenu"
              onMouseEnter={() => setShowGroupSubmenu(true)}
              onMouseLeave={() => setShowGroupSubmenu(false)}
            >
              <FolderPlus size={14} strokeWidth={1.7} />
              <span>Add to group</span>
              <ChevronRight size={14} strokeWidth={1.7} className="canvas-context-menu-chevron" />
              {showGroupSubmenu && (
                <div className="canvas-context-submenu">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="canvas-context-menu-item"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onAddToGroup(nodeId, g.id)
                        onClose()
                      }}
                    >
                      <span>{g.title || 'Unnamed group'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onDelete && (
            <button
              type="button"
              className="canvas-context-menu-item"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(nodeId); onClose() }}
            >
              <Trash2 size={14} strokeWidth={1.7} />
              <span>Delete</span>
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}
