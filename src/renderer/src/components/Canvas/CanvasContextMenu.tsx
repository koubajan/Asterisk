import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'

interface CanvasContextMenuProps {
  x: number
  y: number
  nodeId: string
  onClose: () => void
  onDelete: (nodeId: string) => void
}

export default function CanvasContextMenu({ x, y, nodeId, onClose, onDelete }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <button
        type="button"
        className="canvas-context-menu-item"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(nodeId); onClose() }}
      >
        <Trash2 size={14} strokeWidth={1.7} />
        <span>Delete</span>
      </button>
    </div>
  )
}
