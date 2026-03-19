import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Undo2, Redo2, Plus, ZoomIn, ZoomOut, Maximize2, Link2, Globe, Hand, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Space, Group, Download, Play, LayoutGrid, GitBranch, Network } from 'lucide-react'
import { useArtifacts } from '../../store/useArtifacts'
import type { AutoLayoutMode } from './canvasAutoLayout'

interface CanvasToolbarProps {
  onAddCard?: () => void
  onAddLink?: () => void
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
  moveMode?: boolean
  onMoveModeToggle?: () => void
  onExport?: () => void
  onPresent?: () => void
  onAutoLayout?: (mode: AutoLayoutMode) => void
}

export default function CanvasToolbar({ onAddCard, onAddLink, onZoomIn, onZoomOut, onZoomReset, connectionMode, onConnectionModeToggle, canAlign, onAlign, canDistribute, onDistribute, canCreateGroup, onCreateGroup, selectionMode, onSelectionModeToggle, moveMode, onMoveModeToggle, onExport, onPresent, onAutoLayout }: CanvasToolbarProps) {
  const { data, historyPast, historyFuture, undo, redo } = useArtifacts()
  const canUndo = historyPast.length > 0
  const canRedo = historyFuture.length > 0
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layoutMenuPos, setLayoutMenuPos] = useState({ top: 0, left: 0 })
  const layoutButtonRef = useRef<HTMLButtonElement>(null)
  const layoutMenuRef = useRef<HTMLDivElement>(null)

  const nonGroupCount = data.nodes.filter((n) => n.type !== 'group').length

  const updateLayoutMenuPosition = useCallback(() => {
    const btn = layoutButtonRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const menuW = 200
    const menuH = 140
    let left = r.left
    let top = r.bottom + 4
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuW - 8)
    }
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, r.top - menuH - 4)
    }
    setLayoutMenuPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!layoutOpen) return
    updateLayoutMenuPosition()
  }, [layoutOpen, updateLayoutMenuPosition])

  useEffect(() => {
    if (!layoutOpen) return
    window.addEventListener('resize', updateLayoutMenuPosition)
    window.addEventListener('scroll', updateLayoutMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateLayoutMenuPosition)
      window.removeEventListener('scroll', updateLayoutMenuPosition, true)
    }
  }, [layoutOpen, updateLayoutMenuPosition])

  useEffect(() => {
    if (!layoutOpen) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (layoutButtonRef.current?.contains(t)) return
      if (layoutMenuRef.current?.contains(t)) return
      setLayoutOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [layoutOpen])

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
      {onAddLink && (
        <button type="button" className="canvas-toolbar-btn" onClick={onAddLink} title="Add link (website or YouTube). Paste a URL to add at center.">
          <Globe size={16} strokeWidth={1.7} />
        </button>
      )}
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
      {onMoveModeToggle && (
        <button
          type="button"
          className={`canvas-toolbar-btn${moveMode ? ' active' : ''}`}
          onClick={onMoveModeToggle}
          title="Move mode: only move nodes (no resize or edit)"
        >
          <Hand size={16} strokeWidth={1.7} />
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
      {onAutoLayout && nonGroupCount >= 2 && (
        <>
          <span className="canvas-toolbar-sep" />
          <div className="canvas-toolbar-layout-wrap">
            <button
              ref={layoutButtonRef}
              type="button"
              className={`canvas-toolbar-btn${layoutOpen ? ' active' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setLayoutOpen((o) => !o)
              }}
              title="Auto-layout nodes (grid, tree, or force)"
            >
              <LayoutGrid size={16} strokeWidth={1.7} />
            </button>
            {layoutOpen &&
              createPortal(
                <div
                  ref={layoutMenuRef}
                  className="canvas-toolbar-layout-menu canvas-toolbar-layout-menu-portal"
                  style={{ position: 'fixed', top: layoutMenuPos.top, left: layoutMenuPos.left, zIndex: 20000 }}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onAutoLayout('grid'); setLayoutOpen(false) }}
                    title="Arrange in a grid"
                  >
                    <LayoutGrid size={14} /> Grid
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onAutoLayout('tree'); setLayoutOpen(false) }}
                    title="Layered layout from edges (DAG)"
                  >
                    <GitBranch size={14} /> Tree / layers
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { onAutoLayout('force'); setLayoutOpen(false) }}
                    title="Physics simulation using edges"
                  >
                    <Network size={14} /> Force-directed
                  </button>
                </div>,
                document.body
              )}
          </div>
        </>
      )}
      <span className="canvas-toolbar-sep" />
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
      <span className="canvas-toolbar-zoom">{Math.round(data.viewport.zoom * 100)}%</span>
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomIn} title="Zoom in"><ZoomIn size={16} /></button>
      <button type="button" className="canvas-toolbar-btn" onClick={onZoomReset} title="Fit all nodes in view"><Maximize2 size={16} /></button>
      {onExport && (
        <>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="canvas-toolbar-btn" onClick={onExport} title="Export as image">
            <Download size={16} strokeWidth={1.7} />
          </button>
        </>
      )}
      {onPresent && data.nodes.filter(n => n.type !== 'group').length > 0 && (
        <>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="canvas-toolbar-btn canvas-toolbar-present" onClick={onPresent} title="Start presentation (step through nodes)">
            <Play size={16} strokeWidth={1.7} />
          </button>
        </>
      )}
    </div>
  )
}
