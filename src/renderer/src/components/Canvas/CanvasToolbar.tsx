import { Undo2, Redo2, Plus, ZoomIn, ZoomOut, Maximize2, Link2, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Space, Group } from 'lucide-react'
import { useArtifacts } from '../../store/useArtifacts'

interface CanvasToolbarProps {
  onAddCard?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
  connectionMode?: boolean
  onConnectionModeToggle?: () => void
  canAlign?: boolean
  onAlign?: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void
  canDistribute?: boolean
  onDistribute?: (mode: 'horizontal' | 'vertical') => void
  canCreateGroup?: boolean
  onCreateGroup?: () => void
  selectionMode?: boolean
  onSelectionModeToggle?: () => void
}

export default function CanvasToolbar({ onAddCard, onZoomIn, onZoomOut, onZoomReset, connectionMode, onConnectionModeToggle, canAlign, onAlign, canDistribute, onDistribute, canCreateGroup, onCreateGroup, selectionMode, onSelectionModeToggle }: CanvasToolbarProps) {
  const { data, historyPast, historyFuture, undo, redo } = useArtifacts()
  const canUndo = historyPast.length > 0
  const canRedo = historyFuture.length > 0

  return (
    <div className="canvas-toolbar-wrap">
      <button
        type="button"
        className="canvas-toolbar-btn"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        <Undo2 size={16} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="canvas-toolbar-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 size={16} strokeWidth={1.7} />
      </button>
      <span className="canvas-toolbar-sep" />
      {onSelectionModeToggle && (
        <button
          type="button"
          className={`canvas-toolbar-btn${selectionMode ? ' active' : ''}`}
          onClick={onSelectionModeToggle}
          title="Selection mode (V): Shift+drag to select multiple"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
        </button>
      )}
      <button type="button" className="canvas-toolbar-btn" onClick={onAddCard} title="Add card">
        <Plus size={16} strokeWidth={1.7} />
      </button>
      {onConnectionModeToggle && (
        <button
          type="button"
          className={`canvas-toolbar-btn${connectionMode ? ' active' : ''}`}
          onClick={onConnectionModeToggle}
          title="Connect (Shift + click two nodes)"
        >
          <Link2 size={16} strokeWidth={1.7} />
        </button>
      )}
      {canAlign && onAlign && (
        <>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('left')} title="Align left"><AlignLeft size={14} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('center')} title="Align center"><AlignCenter size={14} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('right')} title="Align right"><AlignRight size={14} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('top')} title="Align top"><AlignStartVertical size={14} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('middle')} title="Align middle"><AlignCenterVertical size={14} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onAlign('bottom')} title="Align bottom"><AlignEndVertical size={14} /></button>
        </>
      )}
      {canDistribute && onDistribute && (
        <>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="canvas-toolbar-btn" onClick={() => onDistribute('horizontal')} title="Distribute horizontally"><Space size={14} style={{ transform: 'rotate(90deg)' }} /></button>
          <button type="button" className="canvas-toolbar-btn" onClick={() => onDistribute('vertical')} title="Distribute vertically"><Space size={14} /></button>
        </>
      )}
      {canCreateGroup && onCreateGroup && (
        <>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="canvas-toolbar-btn" onClick={onCreateGroup} title="Group selection"><Group size={16} strokeWidth={1.7} /></button>
        </>
      )}
      <span className="canvas-toolbar-sep" />
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
      <span className="canvas-toolbar-zoom">{Math.round(data.viewport.zoom * 100)}%</span>
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomIn} title="Zoom in"><ZoomIn size={16} /></button>
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomReset} title="Reset zoom"><Maximize2 size={16} /></button>
    </div>
  )
}
