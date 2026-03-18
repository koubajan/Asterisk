import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { CanvasNode } from '../../types/canvas'

const GROUP_COLORS = [
  '#f5f5f5', '#e8e8e8', '#e3f2fd', '#e8f5e9', '#fff3e0', '#fce4ec', '#ede7f6',
  '#bbdefb', '#c8e6c9', '#ffe0b2', '#f8bbd9', '#d1c4e9'
]

/** Hex to rgba with alpha for subtle group fill */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return `rgba(128,128,128,${alpha})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}

interface CanvasGroupProps {
  group: CanvasNode
  onDrag: (dx: number, dy: number) => void
  onDragEnd?: () => void
  onResize?: (width: number, height: number) => void
  onUpdate?: (updates: Partial<CanvasNode>) => void
  onSelect: () => void
  selected: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function CanvasGroup({
  group,
  onDrag,
  onDragEnd,
  onResize,
  onUpdate,
  onSelect,
  selected,
  onContextMenu
}: CanvasGroupProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerRect, setColorPickerRect] = useState<{ left: number; top: number } | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(group.title ?? '')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const colorPickerAnchorRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ w: 0, h: 0, x: 0, y: 0 })
  const didDragRef = useRef(false)

  useEffect(() => {
    setTitleValue(group.title ?? '')
  }, [group.title])

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus()
  }, [isEditingTitle])

  useLayoutEffect(() => {
    if (!showColorPicker || !colorPickerAnchorRef.current) {
      setColorPickerRect(null)
      return
    }
    const rect = colorPickerAnchorRef.current.getBoundingClientRect()
    setColorPickerRect({ left: rect.right + 6, top: rect.top })
  }, [showColorPicker])

  useEffect(() => {
    if (!showColorPicker) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (colorPickerAnchorRef.current?.contains(target)) return
      if (document.querySelector('.canvas-group-color-picker-floating')?.contains(target)) return
      setShowColorPicker(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showColorPicker])

  const commitTitle = () => {
    const t = titleValue.trim()
    if (t !== (group.title ?? '')) onUpdate?.({ title: t || undefined })
    setIsEditingTitle(false)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('.canvas-group-resize-handle')) return
    if ((e.target as HTMLElement).closest('.canvas-group-header')) return
    onSelect()
    if (e.button !== 0) return
    didDragRef.current = false
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    setIsResizing(true)
    resizeStart.current = { w: group.width, h: group.height, x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isResizing) {
      const { w, h, x, y } = resizeStart.current
      const newW = Math.max(80, w + (e.clientX - x))
      const newH = Math.max(40, h + (e.clientY - y))
      onResize?.(newW, newH)
      resizeStart.current = { w: newW, h: newH, x: e.clientX, y: e.clientY }
      return
    }
    if (!isDragging) return
    didDragRef.current = true
    onDrag(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y)
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button === 0) {
      if (isDragging && didDragRef.current && onDragEnd) onDragEnd()
      setIsDragging(false)
      setIsResizing(false)
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }

  const groupColor = group.color ?? group.backgroundColor ?? 'var(--border)'
  const borderColor = groupColor
  const fillColor = group.backgroundColor
    ? hexToRgba(group.backgroundColor, 0.07)
    : 'rgba(128, 128, 128, 0.04)'

  return (
    <div
      className="canvas-group"
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        backgroundColor: fillColor,
        borderColor,
        boxShadow: selected ? `0 0 0 2px var(--accent)` : undefined
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={onContextMenu}
    >
      <div className="canvas-group-header" style={{ borderColor }} onPointerDown={(e) => e.stopPropagation()}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className="canvas-group-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') {
                setTitleValue(group.title ?? '')
                setIsEditingTitle(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="canvas-group-title-text"
            onClick={(e) => { e.stopPropagation(); setIsEditingTitle(true) }}
            title="Click to rename group"
          >
            {(group.title ?? 'Group').trim() || 'Group'}
          </span>
        )}
        {selected && onUpdate && (
          <div className="canvas-group-colors" ref={colorPickerAnchorRef}>
            <button
              type="button"
              className="canvas-group-color-btn"
              style={{ backgroundColor: group.backgroundColor ?? group.color ?? 'var(--border)' }}
              onPointerDown={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v) }}
            />
          </div>
        )}
      </div>
      {colorPickerRect &&
        selected &&
        onUpdate &&
        createPortal(
          <div
            className="canvas-group-color-picker canvas-group-color-picker-floating"
            style={{
              position: 'fixed',
              left: colorPickerRect.left,
              top: colorPickerRect.top,
              zIndex: 9999
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="canvas-group-color-swatch"
                style={{ backgroundColor: c }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onUpdate({ backgroundColor: c, color: c })
                  setShowColorPicker(false)
                }}
              />
            ))}
            <button
              type="button"
              className="canvas-group-color-reset"
              onPointerDown={(e) => {
                e.stopPropagation()
                onUpdate({ backgroundColor: undefined, color: undefined })
                setShowColorPicker(false)
              }}
            >
              Reset
            </button>
          </div>,
          document.body
        )}
      {onResize && (
        <div
          className="canvas-group-resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      )}
    </div>
  )
}
