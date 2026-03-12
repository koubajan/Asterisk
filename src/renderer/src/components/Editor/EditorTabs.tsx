import { useRef } from 'react'
import { X } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import './EditorTabs.css'

export default function EditorTabs() {
  const openFiles = useWorkspace((s) => s.openFiles)
  const activeFileIndex = useWorkspace((s) => s.activeFileIndex)
  const setActiveFileIndex = useWorkspace((s) => s.setActiveFileIndex)
  const closeTab = useWorkspace((s) => s.closeTab)
  const tabListRef = useRef<HTMLDivElement>(null)

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
              className={`editor-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(index)}
              onAuxClick={(e) => handleAuxClick(e, index)}
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
