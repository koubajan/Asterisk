import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import './EditorTabs.css'

export default function EditorTabs() {
  const openFiles = useWorkspace((s) => s.openFiles)
  const activeFileIndex = useWorkspace((s) => s.activeFileIndex)
  const setActiveFileIndex = useWorkspace((s) => s.setActiveFileIndex)
  const closeTab = useWorkspace((s) => s.closeTab)
  const reorderOpenFiles = useWorkspace((s) => s.reorderOpenFiles)
  const tabListRef = useRef<HTMLDivElement>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  if (openFiles.length === 0) return null

  function handleTabClick(index: number) {
    setActiveFileIndex(index)
  }

  function handleClose(e: React.MouseEvent, index: number) {
    e.stopPropagation()
    closeTab(index)
  }

  function handleAuxClick(e: React.MouseEvent, index: number) {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(index)
    }
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.setData('application/x-editor-tab-index', String(index))
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleDragLeave() {
    setDragOverIndex(null)
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault()
    setDragOverIndex(null)
    const fromIndex = parseInt(e.dataTransfer.getData('application/x-editor-tab-index'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
    reorderOpenFiles(fromIndex, toIndex)
  }

  function handleDragEnd() {
    setDragOverIndex(null)
  }

  return (
    <div className="editor-tabs" ref={tabListRef}>
      <div className="editor-tabs-list" role="tablist">
        {openFiles.map((file, index) => {
          const isActive = index === activeFileIndex
          const name = file.name
          return (
            <div
              key={file.path}
              role="tab"
              aria-selected={isActive}
              draggable
              className={`editor-tab ${isActive ? 'active' : ''} ${dragOverIndex === index ? 'editor-tab-drag-over' : ''}`}
              onClick={() => handleTabClick(index)}
              onAuxClick={(e) => handleAuxClick(e, index)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="editor-tab-name" title={file.path}>
                {name}
              </span>
              <span className={`editor-tab-dirty ${file.isDirty ? 'dirty' : ''}`}>
                {file.isDirty ? '●' : '○'}
              </span>
              <button
                type="button"
                className="editor-tab-close"
                onClick={(e) => handleClose(e, index)}
                title="Close tab"
                aria-label="Close tab"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
