import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { CanvasEdge as CanvasEdgeType, CanvasNode } from '../../types/canvas'

interface CanvasEdgeProps {
  edge: CanvasEdgeType
  nodes: CanvasNode[]
  selected?: boolean
  editingLabel?: boolean
  /** When false, hide the color/label edit UI (e.g. when context menu is open for this edge). */
  showEditUI?: boolean
  onSelect?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent<SVGGElement>) => void
  onLabelChange?: (label: string) => void
  onLabelEditEnd?: () => void
  onColorChange?: (color: string | undefined) => void
  getScreenPoint?: (canvasX: number, canvasY: number) => { x: number; y: number }
}

/** Where segment (ax,ay)->(bx,by) exits rect [rx, ry, rw, rh] (first boundary hit going from A toward B). */
function segmentRectExit(ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number): { x: number; y: number } {
  const dx = bx - ax
  const dy = by - ay
  const ts: number[] = []
  if (Math.abs(dy) > 1e-9) {
    const tTop = (ry - ay) / dy
    const tBottom = (ry + rh - ay) / dy
    if (tTop >= 0 && tTop <= 1) { const x = ax + tTop * dx; if (rx <= x && x <= rx + rw) ts.push(tTop) }
    if (tBottom >= 0 && tBottom <= 1) { const x = ax + tBottom * dx; if (rx <= x && x <= rx + rw) ts.push(tBottom) }
  }
  if (Math.abs(dx) > 1e-9) {
    const tLeft = (rx - ax) / dx
    const tRight = (rx + rw - ax) / dx
    if (tLeft >= 0 && tLeft <= 1) { const y = ay + tLeft * dy; if (ry <= y && y <= ry + rh) ts.push(tLeft) }
    if (tRight >= 0 && tRight <= 1) { const y = ay + tRight * dy; if (ry <= y && y <= ry + rh) ts.push(tRight) }
  }
  if (ts.length === 0) return { x: ax, y: ay }
  const positive = ts.filter((t) => t > 1e-9)
  const t = positive.length > 0 ? Math.min(...positive) : Math.max(...ts)
  return { x: ax + t * dx, y: ay + t * dy }
}

/** Connection from node boundary to node boundary (line goes center-to-center but drawn from edge to edge so it doesn't overlap text). */
function getConnectionEndpoints(
  fromNode: CanvasNode,
  toNode: CanvasNode
): [{ x: number; y: number }, { x: number; y: number }] {
  const cx1 = fromNode.x + fromNode.width / 2
  const cy1 = fromNode.y + fromNode.height / 2
  const cx2 = toNode.x + toNode.width / 2
  const cy2 = toNode.y + toNode.height / 2
  const exit1 = segmentRectExit(cx1, cy1, cx2, cy2, fromNode.x, fromNode.y, fromNode.width, fromNode.height)
  const exit2 = segmentRectExit(cx2, cy2, cx1, cy1, toNode.x, toNode.y, toNode.width, toNode.height)
  return [exit1, exit2]
}

const EDGE_HIT_WIDTH = 16
/** Same palette as nodes/groups for consistency */
const EDGE_PRESET_COLORS = [
  '#f5f5f5', '#e8e8e8', '#e3f2fd', '#e8f5e9', '#fff3e0', '#fce4ec', '#ede7f6',
  '#bbdefb', '#c8e6c9', '#ffe0b2', '#f8bbd9', '#d1c4e9'
]

const PICKER_WIDTH = 100
const PICKER_HEIGHT = 52

export default function CanvasEdge({
  edge,
  nodes,
  selected,
  editingLabel,
  showEditUI = true,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onLabelChange,
  onLabelEditEnd,
  onColorChange,
  getScreenPoint
}: CanvasEdgeProps) {
  const [labelValue, setLabelValue] = useState(edge.label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const fromNode = nodes.find((n) => n.id === edge.from)
  const toNode = nodes.find((n) => n.id === edge.to)
  if (!fromNode || !toNode) return null

  const [p1, p2] = getConnectionEndpoints(fromNode, toNode)
  const { x: x1, y: y1 } = p1
  const { x: x2, y: y2 } = p2
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1
  const ctrlOffset = Math.min(dist * 0.5, 80)
  const cx = (x1 + x2) / 2 + (-dy / dist) * ctrlOffset
  const cy = (y1 + y2) / 2 + (dx / dist) * ctrlOffset
  const path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
  const color = edge.color ?? 'var(--border)'
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  /* Offset picker toward curve bulge so it doesn't overlap the connection */
  const offDist = Math.hypot(cx - midX, cy - midY) || 1
  const pickerOffset = 36
  const pickerX = midX + ((cx - midX) / offDist) * pickerOffset
  const pickerY = midY + ((cy - midY) / offDist) * pickerOffset
  const screenPos = getScreenPoint?.(pickerX, pickerY)

  useEffect(() => {
    setLabelValue(edge.label ?? '')
  }, [edge.label])

  useEffect(() => {
    if (editingLabel) inputRef.current?.focus()
  }, [editingLabel])

  const commitLabel = () => {
    onLabelChange?.(labelValue.trim())
    onLabelEditEnd?.()
  }

  const markerId = `canvas-edge-arrow-${edge.id}`
  const strokeW = selected ? 3 : 2

  return (
    <g
      data-canvas-edge
      pointerEvents="auto"
      cursor="pointer"
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu?.(e) }}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth={10}
          markerHeight={8}
          refX={9}
          refY={4}
          orient="auto"
        >
          <polygon points="0 0, 10 4, 0 8" fill={color} />
        </marker>
      </defs>
      {/* Wide hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={EDGE_HIT_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
      />
      {selected && showEditUI && onColorChange && (screenPos ? createPortal(
        <div
          className="canvas-edge-selected-ui canvas-edge-selected-ui-floating"
          style={{
            position: 'fixed',
            left: screenPos.x - PICKER_WIDTH / 2,
            top: screenPos.y - PICKER_HEIGHT / 2 - 6,
            minWidth: PICKER_WIDTH,
            zIndex: 10000,
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="canvas-edge-color-picker">
            {EDGE_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="canvas-edge-color-swatch"
                style={{ backgroundColor: c, borderColor: c }}
                onClick={(e) => { e.stopPropagation(); onColorChange(c) }}
              />
            ))}
            <button
              type="button"
              className="canvas-edge-color-reset"
              onClick={(e) => { e.stopPropagation(); onColorChange(undefined) }}
              title="Reset to default color"
            >
              Reset
            </button>
          </div>
          {editingLabel ? (
            <input
              ref={inputRef}
              type="text"
              className="canvas-edge-label-input"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLabel()
                if (e.key === 'Escape') { setLabelValue(edge.label ?? ''); onLabelEditEnd?.() }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : edge.label ? (
            <div className="canvas-edge-label-text" onClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}>
              {edge.label}
            </div>
          ) : onDoubleClick ? (
            <button type="button" className="canvas-edge-label-hint" onClick={(e) => { e.stopPropagation(); onDoubleClick() }}>
              Double-click to add label
            </button>
          ) : null}
        </div>,
        document.body
      ) : (
        <foreignObject x={pickerX - PICKER_WIDTH / 2} y={pickerY - PICKER_HEIGHT / 2 - 8} width={PICKER_WIDTH} height={PICKER_HEIGHT}>
          <div className="canvas-edge-selected-ui">
            <div className="canvas-edge-color-picker">
              {EDGE_PRESET_COLORS.map((c) => (
                <button key={c} type="button" className="canvas-edge-color-swatch" style={{ backgroundColor: c, borderColor: c }} onClick={(e) => { e.stopPropagation(); onColorChange(c) }} />
              ))}
              <button type="button" className="canvas-edge-color-reset" onClick={(e) => { e.stopPropagation(); onColorChange(undefined) }} title="Reset to default color">Reset</button>
            </div>
            {editingLabel ? <input ref={inputRef} type="text" className="canvas-edge-label-input" value={labelValue} onChange={(e) => setLabelValue(e.target.value)} onBlur={commitLabel} onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelValue(edge.label ?? ''); onLabelEditEnd?.() } }} onClick={(e) => e.stopPropagation()} /> : edge.label ? <div className="canvas-edge-label-text" onClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}>{edge.label}</div> : onDoubleClick ? <button type="button" className="canvas-edge-label-hint" onClick={(e) => { e.stopPropagation(); onDoubleClick() }}>Double-click to add label</button> : null}
          </div>
        </foreignObject>
      ))}
      {!selected && edge.label ? (
        <text
          x={midX}
          y={midY}
          fill="var(--text-muted)"
          fontSize={11}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {edge.label}
        </text>
      ) : null}
    </g>
  )
}
