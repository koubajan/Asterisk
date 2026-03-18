import React, { useRef, useState, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { useArtifacts } from '../../store/useArtifacts'
import { useWorkspace } from '../../store/useWorkspace'
import { useCanvas } from './useCanvas'
import CanvasNode from './CanvasNode'
import CanvasEdge from './CanvasEdge'
import CanvasGroup from './CanvasGroup'
import CanvasToolbar from './CanvasToolbar'
import CanvasContextMenu from './CanvasContextMenu'
import { exportCanvasAsImage } from './exportCanvas'
import './Canvas.css'

const BOARD_SIZE = 4000
const GRID_SIZE = 24 // snap grid for nodes
const ZOOM_MIN = 0.1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.1

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function resolvePath(workspacePath: string, relOrAbs: string): string {
  if (!relOrAbs) return ''
  if (relOrAbs.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relOrAbs)) return relOrAbs
  const baseParts = workspacePath.replace(/\/$/, '').split(/[/\\]/)
  const relParts = relOrAbs.replace(/^\.\//, '').split(/[/\\]/)
  for (const p of relParts) {
    if (p === '..') baseParts.pop()
    else if (p !== '.') baseParts.push(p)
  }
  return baseParts.join('/')
}

function resolveFileNodePath(raw: string, workspacePath: string): string {
  let r = raw.trim()
  if (r.startsWith('file://')) {
    try {
      r = decodeURIComponent(
        r.replace(/^file:\/\/+/i, '').replace(/^\/([A-Za-z]:)/, '$1')
      ).replace(/\\/g, '/')
    } catch {
      return ''
    }
  }
  if (!r) return ''
  if (r.startsWith('/') || /^[A-Za-z]:[\\/]/.test(r)) return r.replace(/\\/g, '/')
  if (workspacePath) return resolvePath(workspacePath, r)
  return ''
}

const EDGE_DESELECT_DELAY_MS = 250

const BOARD_CENTER = BOARD_SIZE / 2

export default function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const clearEdgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const centeredPathRef = useRef<string | null>(null)
  const { data, updateNode, setViewport, addNode, addEdge, removeNode, removeEdge, updateEdge, undo, redo } = useArtifacts()
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useCanvas(areaRef)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [connectionFromId, setConnectionFromId] = useState<string | null>(null)
  const [connectionCursor, setConnectionCursor] = useState<{ x: number; y: number } | null>(null)
  const [connectionMode, setConnectionMode] = useState(false)
  const [moveMode, setMoveMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number }; active: boolean } | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [filePreviews, setFilePreviews] = useState<Record<string, { content: string } | { error: true }>>({})
  const filePreviewsLoadingRef = useRef<Set<string>>(new Set())
  const [addLinkDialog, setAddLinkDialog] = useState<{ x: number; y: number } | null>(null)
  const [addLinkUrl, setAddLinkUrl] = useState('')
  const addLinkInputRef = useRef<HTMLInputElement>(null)
  const { nodes, edges, viewport } = data
  const canvasPath = useArtifacts((s) => s.canvasPath)
  const workspacePath = useWorkspace((s) => s.workspaces[s.activeWorkspaceIndex]?.path ?? '')

  // Load file contents for file nodes: cache by raw node.content so lookup in CanvasNode matches (skip PDF – rendered via iframe)
  useEffect(() => {
    const fileNodes = nodes.filter(
      (n): n is typeof n & { type: 'file'; content: string } =>
        n.type === 'file' && Boolean(n.content.trim()) && !/\.pdf$/i.test(n.content.trim())
    )
    fileNodes.forEach((n) => {
      const rawKey = n.content.trim()
      if (filePreviews[rawKey] || filePreviewsLoadingRef.current.has(rawKey)) return
      const resolvedPath = resolveFileNodePath(n.content, workspacePath)
      if (!resolvedPath) {
        setFilePreviews((prev) => ({ ...prev, [rawKey]: { error: true } }))
        return
      }
      filePreviewsLoadingRef.current.add(rawKey)
      window.asterisk.readFile(resolvedPath).then((r) => {
        setFilePreviews((prev) => ({
          ...prev,
          [rawKey]: r.ok && r.data?.content != null ? { content: r.data.content } : { error: true }
        }))
        filePreviewsLoadingRef.current.delete(rawKey)
      }).catch(() => {
        setFilePreviews((prev) => ({ ...prev, [rawKey]: { error: true } }))
        filePreviewsLoadingRef.current.delete(rawKey)
      })
    })
  }, [nodes, workspacePath, filePreviews])

  // Center view on grid center when opening an artifact
  useEffect(() => {
    if (!canvasPath) {
      centeredPathRef.current = null
      return
    }
    if (centeredPathRef.current === canvasPath) return
    const el = areaRef.current
    if (!el) return
    const run = () => {
      if (centeredPathRef.current === canvasPath) return
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 && height === 0) return
      centeredPathRef.current = canvasPath
      setViewport({
        x: -BOARD_CENTER + width / 2,
        y: -BOARD_CENTER + height / 2,
        zoom: 1
      })
    }
    run()
    const id = requestAnimationFrame(run)
    return () => cancelAnimationFrame(id)
  }, [canvasPath, setViewport])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.closest?.('input') || target?.closest?.('textarea')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setSelectionMode((prev) => !prev)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          e.preventDefault()
          removeEdge(selectedEdgeId)
          setSelectedEdgeId(null)
          setEditingEdgeId(null)
        } else if (selectedIds.size > 0) {
          e.preventDefault()
          selectedIds.forEach((id) => {
            const node = nodes.find((n) => n.id === id)
            if (node?.type === 'group' && node.childIds?.length) {
              node.childIds.forEach((cid) => removeNode(cid))
            }
            removeNode(id)
          })
          setSelectedIds(new Set())
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedIds, selectedEdgeId, nodes, removeNode, removeEdge, undo, redo])

  const openFiles = useWorkspace((s) => s.openFiles)
  const activeFileIndex = useWorkspace((s) => s.activeFileIndex)
  const closeTab = useWorkspace((s) => s.closeTab)
  const openFile = openFiles[activeFileIndex] ?? null
  const artifactName = openFile?.name ?? 'Artifact'

  const handleZoom = useCallback(
    (delta: number, clientX?: number, clientY?: number) => {
      const el = areaRef.current
      const { data: d } = useArtifacts.getState()
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, d.viewport.zoom + delta))
      if (nextZoom === d.viewport.zoom) return
      const rect = el?.getBoundingClientRect()
      const cx = rect && clientX != null && clientY != null ? clientX : (rect ? rect.left + rect.width / 2 : 0)
      const cy = rect && clientX != null && clientY != null ? clientY : (rect ? rect.top + rect.height / 2 : 0)
      const px = rect ? (cx - rect.left - d.viewport.x) / d.viewport.zoom : 0
      const py = rect ? (cy - rect.top - d.viewport.y) / d.viewport.zoom : 0
      const newX = rect ? cx - rect.left - px * nextZoom : d.viewport.x
      const newY = rect ? cy - rect.top - py * nextZoom : d.viewport.y
      setViewport({ zoom: nextZoom, x: newX, y: newY })
    },
    [setViewport]
  )

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      const overScrollableNode =
        target.closest('.canvas-node-file-wrap') ||
        target.closest('.canvas-node-embed-wrap') ||
        target.closest('.canvas-node-content')
      if (overScrollableNode) {
        return
      }
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      handleZoom(delta, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [handleZoom])

  const handleBoardPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-node')) return
    if ((e.target as HTMLElement).closest('.canvas-group')) return
    if ((e.target as Element).closest?.('[data-canvas-edge]')) {
      if (clearEdgeTimeoutRef.current) {
        clearTimeout(clearEdgeTimeoutRef.current)
        clearEdgeTimeoutRef.current = null
      }
      return
    }
    setContextMenu(null)
    if (clearEdgeTimeoutRef.current) clearTimeout(clearEdgeTimeoutRef.current)
    clearEdgeTimeoutRef.current = setTimeout(() => {
      setSelectedEdgeId(null)
      setEditingEdgeId(null)
      clearEdgeTimeoutRef.current = null
    }, EDGE_DESELECT_DELAY_MS)
    if (connectionFromId) setConnectionFromId(null)
    else if (e.shiftKey || selectionMode) {
      setSelectedIds(new Set())
      const { x, y } = getCanvasCoords(e.clientX, e.clientY)
      setSelectionBox({ start: { x, y }, end: { x, y }, active: false })
    } else {
      setSelectionBox(null)
      handlePointerDown(e)
    }
  }

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const el = areaRef.current
      if (!el) return { x: 100, y: 100 }
      const rect = el.getBoundingClientRect()
      const x = (clientX - rect.left - viewport.x) / viewport.zoom
      const y = (clientY - rect.top - viewport.y) / viewport.zoom
      return { x: Math.max(0, Math.min(BOARD_SIZE - 280, x)), y: Math.max(0, Math.min(BOARD_SIZE - 120, y)) }
    },
    [viewport]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.closest?.('input') || target?.closest?.('textarea')) return
      const text = (e.clipboardData?.getData('text/plain') ?? '').trim()
      if (!/^https?:\/\/[^\s]+$/i.test(text)) return
      e.preventDefault()
      const el = areaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const centerClientX = rect.left + rect.width / 2
      const centerClientY = rect.top + rect.height / 2
      const { x, y } = getCanvasCoords(centerClientX, centerClientY)
      addNode({
        type: 'link',
        x: Math.max(0, x - 160),
        y: Math.max(0, y - 100),
        width: 320,
        height: 200,
        content: text,
        embed: true
      })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [getCanvasCoords, addNode])

  const handleNodeSelect = useCallback((nodeId: string, addToSelection: boolean) => {
    if (addToSelection) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(nodeId)) next.delete(nodeId)
        else next.add(nodeId)
        return next
      })
    } else {
      setSelectedIds(new Set([nodeId]))
    }
  }, [])

  const handleNodeShiftClick = useCallback(
    (nodeId: string) => {
      if (connectionFromId) {
        if (connectionFromId !== nodeId) {
          addEdge(connectionFromId, nodeId)
          setConnectionMode(false)
        }
        setConnectionFromId(null)
        setConnectionCursor(null)
      } else {
        setConnectionFromId(nodeId)
        setConnectionCursor(null)
      }
    },
    [connectionFromId, addEdge]
  )

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (connectionFromId) {
        setConnectionCursor(getCanvasCoords(e.clientX, e.clientY))
        return
      }
      if (selectionBox) {
        const end = getCanvasCoords(e.clientX, e.clientY)
        const dist = Math.hypot(end.x - selectionBox.start.x, end.y - selectionBox.start.y)
        const active = selectionBox.active || dist > 8
        setSelectionBox((prev) => (prev ? { ...prev, end, active } : null))
        if (active) return
      }
      handlePointerMove(e)
    },
    [connectionFromId, getCanvasCoords, handlePointerMove, selectionBox]
  )

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (connectionFromId && (e.target as HTMLElement).closest?.('.canvas-node') == null) {
        setConnectionFromId(null)
        setConnectionCursor(null)
      }
      if (selectionBox?.active && selectionBox.start) {
        const { start, end } = selectionBox
        const minX = Math.min(start.x, end.x)
        const maxX = Math.max(start.x, end.x)
        const minY = Math.min(start.y, end.y)
        const maxY = Math.max(start.y, end.y)
        const ids = nodes.filter(
          (n) =>
            n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY
        ).map((n) => n.id)
        setSelectedIds(new Set(ids))
      }
      setSelectionBox(null)
      handlePointerUp(e)
    },
    [connectionFromId, handlePointerUp, selectionBox, nodes]
  )

  const handleNodeDrag = useCallback(
    (id: string, dx: number, dy: number) => {
      const toMove = selectedIds.has(id) ? [...selectedIds] : [id]
      toMove.forEach((nid) => {
        const node = nodes.find((n) => n.id === nid)
        if (node) updateNode(nid, { x: node.x + dx, y: node.y + dy })
      })
    },
    [nodes, updateNode, selectedIds]
  )

  const handleNodeDragEnd = useCallback(
    (id: string) => {
      const toSnap = selectedIds.has(id) ? [...selectedIds] : [id]
      toSnap.forEach((nid) => {
        const node = nodes.find((n) => n.id === nid)
        if (!node) return
        const x = Math.max(0, snapToGrid(node.x))
        const y = Math.max(0, snapToGrid(node.y))
        if (x !== node.x || y !== node.y) updateNode(nid, { x, y })
      })
    },
    [nodes, updateNode, selectedIds]
  )

  const selectedNodes = nodes.filter((n) => selectedIds.has(n.id))
  const groupNodes = nodes.filter((n) => n.type === 'group')
  const canAlign = selectedNodes.length >= 2
  const canCreateGroup = selectedNodes.length >= 2

  const handleAlign = useCallback(
    (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (selectedNodes.length < 2) return
      const minX = Math.min(...selectedNodes.map((n) => n.x))
      const maxX = Math.max(...selectedNodes.map((n) => n.x + n.width))
      const minY = Math.min(...selectedNodes.map((n) => n.y))
      const maxY = Math.max(...selectedNodes.map((n) => n.y + n.height))
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      selectedNodes.forEach((node) => {
        const updates: Partial<{ x: number; y: number }> = {}
        if (mode === 'left') updates.x = minX
        else if (mode === 'right') updates.x = maxX - node.width
        else if (mode === 'center') updates.x = centerX - node.width / 2
        if (mode === 'top') updates.y = minY
        else if (mode === 'bottom') updates.y = maxY - node.height
        else if (mode === 'middle') updates.y = centerY - node.height / 2
        const changed = ('x' in updates && updates.x !== node.x) || ('y' in updates && updates.y !== node.y)
        if (Object.keys(updates).length && changed) updateNode(node.id, updates)
      })
    },
    [selectedNodes, updateNode]
  )

  const handleDistribute = useCallback(
    (mode: 'horizontal' | 'vertical') => {
      if (selectedNodes.length < 3) return
      const sorted = mode === 'horizontal'
        ? [...selectedNodes].sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2))
        : [...selectedNodes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      if (mode === 'horizontal') {
        const start = first.x + first.width / 2
        const end = last.x + last.width / 2
        const totalWidth = end - start
        const totalNodeWidth = sorted.reduce((s, n) => s + n.width, 0)
        const gap = (totalWidth - totalNodeWidth) / (sorted.length - 1)
        let x = start
        sorted.forEach((node) => {
          updateNode(node.id, { x: Math.round(x - node.width / 2) })
          x += node.width + gap
        })
      } else {
        const start = first.y + first.height / 2
        const end = last.y + last.height / 2
        const totalHeight = end - start
        const totalNodeHeight = sorted.reduce((s, n) => s + n.height, 0)
        const gap = (totalHeight - totalNodeHeight) / (sorted.length - 1)
        let y = start
        sorted.forEach((node) => {
          updateNode(node.id, { y: Math.round(y - node.height / 2) })
          y += node.height + gap
        })
      }
    },
    [selectedNodes, updateNode]
  )

  const handleCreateGroup = useCallback(() => {
    if (selectedNodes.length < 2) return
    const minX = Math.min(...selectedNodes.map((n) => n.x))
    const minY = Math.min(...selectedNodes.map((n) => n.y))
    const maxX = Math.max(...selectedNodes.map((n) => n.x + n.width))
    const maxY = Math.max(...selectedNodes.map((n) => n.y + n.height))
    addNode({
      type: 'group',
      x: minX - 12,
      y: minY - 12,
      width: maxX - minX + 24,
      height: maxY - minY + 24,
      content: '',
      title: 'Group',
      childIds: selectedNodes.map((n) => n.id)
    })
  }, [selectedNodes, addNode])

  const handleGroupDrag = useCallback(
    (groupId: string, dx: number, dy: number) => {
      const group = nodes.find((n) => n.id === groupId)
      if (!group || group.type !== 'group') return
      updateNode(groupId, { x: group.x + dx, y: group.y + dy })
      const childIdSet = new Set(group.childIds ?? [])
      nodes.forEach((n) => {
        if (n.id === groupId || n.type === 'group') return
        const insideBounds =
          n.x >= group.x &&
          n.y >= group.y &&
          n.x + n.width <= group.x + group.width &&
          n.y + n.height <= group.y + group.height
        if (childIdSet.has(n.id) || insideBounds) {
          updateNode(n.id, { x: n.x + dx, y: n.y + dy })
        }
      })
    },
    [nodes, updateNode]
  )

  const handleGroupDragEnd = useCallback(
    (groupId: string) => {
      const group = nodes.find((n) => n.id === groupId)
      if (!group || group.type !== 'group') return
      const x = Math.max(0, snapToGrid(group.x))
      const y = Math.max(0, snapToGrid(group.y))
      if (x !== group.x || y !== group.y) updateNode(groupId, { x, y })
      const childIdSet = new Set(group.childIds ?? [])
      nodes.forEach((n) => {
        if (n.id === groupId || n.type === 'group') return
        const insideBounds =
          n.x >= group.x &&
          n.y >= group.y &&
          n.x + n.width <= group.x + group.width &&
          n.y + n.height <= group.y + group.height
        if (childIdSet.has(n.id) || insideBounds) {
          const cx = Math.max(0, snapToGrid(n.x))
          const cy = Math.max(0, snapToGrid(n.y))
          if (cx !== n.x || cy !== n.y) updateNode(n.id, { x: cx, y: cy })
        }
      })
    },
    [nodes, updateNode]
  )

  const handleAddCardAtViewportCenter = useCallback(() => {
    const el = areaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centerClientX = rect.left + rect.width / 2
    const centerClientY = rect.top + rect.height / 2
    const { x, y } = getCanvasCoords(centerClientX, centerClientY)
    const cardWidth = 200
    const cardHeight = 60
    addNode({
      type: 'text',
      x: Math.max(0, x - cardWidth / 2),
      y: Math.max(0, y - cardHeight / 2),
      width: cardWidth,
      height: cardHeight,
      content: ''
    })
  }, [getCanvasCoords, addNode])

  const handleAddLinkAtViewportCenter = useCallback(() => {
    const el = areaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centerClientX = rect.left + rect.width / 2
    const centerClientY = rect.top + rect.height / 2
    const { x, y } = getCanvasCoords(centerClientX, centerClientY)
    const pos = { x: Math.max(0, x - 160), y: Math.max(0, y - 100) }
    const addLinkNode = (url: string) => {
      const trimmed = url.trim()
      if (!trimmed || !/^https?:\/\//i.test(trimmed)) return
      addNode({
        type: 'link',
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 200,
        content: trimmed,
        embed: true
      })
    }
    navigator.clipboard.readText().then((clip) => {
      const url = clip?.trim() ?? ''
      if (url && /^https?:\/\//i.test(url)) {
        addLinkNode(url)
      } else {
        setAddLinkUrl(url || 'https://')
        setAddLinkDialog(pos)
        requestAnimationFrame(() => addLinkInputRef.current?.focus())
      }
    }).catch(() => {
      setAddLinkUrl('https://')
      setAddLinkDialog(pos)
      requestAnimationFrame(() => addLinkInputRef.current?.focus())
    })
  }, [getCanvasCoords, addNode])

  useEffect(() => {
    if (addLinkDialog) {
      addLinkInputRef.current?.focus()
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setAddLinkDialog(null)
          setAddLinkUrl('')
        }
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }
  }, [addLinkDialog])

  const handleAddLinkSubmit = useCallback(() => {
    const trimmed = addLinkUrl.trim()
    if (!trimmed || !/^https?:\/\//i.test(trimmed) || !addLinkDialog) return
    addNode({
      type: 'link',
      x: addLinkDialog.x,
      y: addLinkDialog.y,
      width: 320,
      height: 200,
      content: trimmed,
      embed: true
    })
    setAddLinkDialog(null)
    setAddLinkUrl('')
  }, [addLinkDialog, addLinkUrl, addNode])

  const handleClose = () => {
    closeTab(activeFileIndex)
  }

  const handleExport = useCallback(async () => {
    const defaultName = artifactName.replace(/\.artifact$/i, '') + '.png'
    await exportCanvasAsImage(nodes, edges, defaultName)
  }, [nodes, edges, artifactName])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  /** Get absolute file path from drag (Finder, etc.); prefers path from uri-list on macOS. */
  const getDroppedFilePath = useCallback((e: React.DragEvent): string | null => {
    const f = e.dataTransfer.files?.[0] as (File & { path?: string }) | undefined
    const electronPath = f?.path
    if (electronPath) return electronPath.replace(/\\/g, '/')

    const uriList = e.dataTransfer.getData('text/uri-list')
    if (uriList) {
      const first = uriList.trim().split(/\s/)[0]
      if (first?.startsWith('file://')) {
        try {
          const decoded = decodeURIComponent(first.replace(/^file:\/\/+/i, '').replace(/^\/([A-Za-z]:)/, '$1'))
          return decoded.replace(/\\/g, '/')
        } catch {
          return null
        }
      }
    }

    if (f?.name && workspacePath) return resolvePath(workspacePath, f.name)
    return null
  }, [workspacePath])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      let filePath: string | null = null
      const treePath = (e.dataTransfer.getData('application/x-asterisk-tree-path') || '').trim()
      const plain = (e.dataTransfer.getData('text/plain') || '').trim()
      if (treePath) {
        filePath = treePath.startsWith('/') || /^[A-Za-z]:/.test(treePath) ? treePath : resolvePath(workspacePath, treePath)
      } else if (e.dataTransfer.files?.length) {
        filePath = getDroppedFilePath(e)
      } else if (plain) {
        if (/^https?:\/\/[^\s]+$/i.test(plain)) {
          const { x, y } = getCanvasCoords(e.clientX, e.clientY)
          addNode({
            type: 'link',
            x,
            y,
            width: 320,
            height: 200,
            content: plain.trim(),
            embed: true
          })
          return
        }
        const match = /^\[([^\]]*)\]\((.*)\)$/.exec(plain)
        if (match) {
          const url = match[2].trim()
          if (/^https?:\/\//i.test(url)) {
            const { x, y } = getCanvasCoords(e.clientX, e.clientY)
            addNode({
              type: 'link',
              x,
              y,
              width: 320,
              height: 200,
              content: url,
              embed: true
            })
            return
          }
          filePath = resolvePath(workspacePath, url)
        } else {
          filePath = resolvePath(workspacePath, plain)
        }
      }
      if (!filePath?.trim()) return
      const absolutePath = (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath))
        ? filePath.trim()
        : (workspacePath ? resolvePath(workspacePath, filePath.trim()) : filePath.trim())
      const ext = absolutePath.toLowerCase().slice(absolutePath.lastIndexOf('.'))
      const { x, y } = getCanvasCoords(e.clientX, e.clientY)
      if (ext === '.pdf') {
        addNode({
          type: 'file',
          x,
          y,
          width: 360,
          height: 480,
          content: absolutePath
        })
      } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
        addNode({
          type: 'file',
          x,
          y,
          width: 280,
          height: 160,
          content: absolutePath
        })
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic', '.heif', '.avif'].includes(ext)) {
        addNode({
          type: 'image',
          x,
          y,
          width: 240,
          height: 160,
          content: absolutePath
        })
      } else {
        addNode({
          type: 'file',
          x,
          y,
          width: 280,
          height: 120,
          content: absolutePath
        })
      }
    },
    [workspacePath, getCanvasCoords, addNode, getDroppedFilePath]
  )

  return (
    <div className="canvas-root">
      <header className="artifact-header">
        <span className="artifact-header-name">{artifactName}</span>
        <button
          type="button"
          className="artifact-header-close"
          onClick={handleClose}
          title="Close Artifact (switch to another tab)"
          aria-label="Close Artifact"
        >
          <X size={14} strokeWidth={1.7} />
        </button>
      </header>
      <div className="canvas-toolbar-bar">
        <CanvasToolbar
          onAddCard={handleAddCardAtViewportCenter}
          onAddLink={handleAddLinkAtViewportCenter}
          onZoomIn={() => handleZoom(ZOOM_STEP)}
          onZoomOut={() => handleZoom(-ZOOM_STEP)}
          onZoomReset={() => setViewport({ zoom: 1, x: 0, y: 0 })}
          connectionMode={connectionMode}
          onConnectionModeToggle={() => setConnectionMode((m) => !m)}
          canAlign={canAlign}
          moveMode={moveMode}
          onMoveModeToggle={() => setMoveMode((m) => !m)}
          onAlign={handleAlign}
          canDistribute={selectedNodes.length >= 3}
          onDistribute={handleDistribute}
          canCreateGroup={canCreateGroup}
          onCreateGroup={handleCreateGroup}
          selectionMode={selectionMode}
          onSelectionModeToggle={() => setSelectionMode((m) => !m)}
          onExport={handleExport}
        />
      </div>
      <div
        ref={areaRef}
        className={`canvas-area${connectionMode ? ' canvas-area-connection-mode' : ''}${moveMode ? ' canvas-area-move-mode' : ''}`}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          ref={rootRef}
          className="canvas-view"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
          }}
        >
          <div className="canvas-board" />
          {groupNodes.map((group) => (
            <CanvasGroup
              key={group.id}
              group={group}
              onDrag={(dx, dy) => handleGroupDrag(group.id, dx, dy)}
              onDragEnd={() => handleGroupDragEnd(group.id)}
              onResize={(width, height) => updateNode(group.id, { width, height })}
              onUpdate={(updates) => updateNode(group.id, updates)}
              onSelect={() => setSelectedIds(new Set([group.id]))}
              selected={selectedIds.has(group.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ x: e.clientX, y: e.clientY, nodeId: group.id })
              }}
            />
          ))}
          {selectionBox?.active && (
            <div
              className="canvas-selection-box"
              style={{
                left: Math.min(selectionBox.start.x, selectionBox.end.x),
                top: Math.min(selectionBox.start.y, selectionBox.end.y),
                width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                height: Math.abs(selectionBox.end.y - selectionBox.start.y)
              }}
            />
          )}
          <div className="canvas-nodes-layer" style={{ width: BOARD_SIZE, height: BOARD_SIZE }}>
            {nodes.filter((n) => n.type !== 'group').map((node) => {
              const rawKey = node.type === 'file' && node.content ? node.content.trim() : ''
              const preview = rawKey ? filePreviews[rawKey] : undefined
              const fileError = rawKey ? Boolean(preview && 'error' in preview) : Boolean(node.type === 'file' && node.content)
              return (
              <CanvasNode
                key={node.id}
                node={node}
                workspacePath={workspacePath}
                filePreviewContent={preview && 'content' in preview ? preview.content : undefined}
                filePreviewError={fileError}
                onDrag={(dx, dy) => handleNodeDrag(node.id, dx, dy)}
                onDragEnd={() => handleNodeDragEnd(node.id)}
                onSelect={(addToSelection) => handleNodeSelect(node.id, addToSelection ?? false)}
                selected={selectedIds.has(node.id)}
                onDoubleClick={() => {}}
                onContentChange={(content) => updateNode(node.id, { content })}
                onTitleChange={(title) => updateNode(node.id, { title })}
                onUpdate={(updates) => updateNode(node.id, updates)}
                onResize={(width, height) => updateNode(node.id, { width, height })}
                onShiftClick={() => handleNodeShiftClick(node.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
                }}
                connectionMode={connectionMode}
                moveMode={moveMode}
              />
            )})}
          </div>
          <svg
            className="canvas-edges-layer canvas-edges-layer-on-top"
            width={BOARD_SIZE}
            height={BOARD_SIZE}
            style={{ position: 'absolute', left: 0, top: 0, width: BOARD_SIZE, height: BOARD_SIZE }}
          >
            {edges.map((edge) => (
              <CanvasEdge
                key={edge.id}
                edge={edge}
                nodes={nodes}
                selected={selectedEdgeId === edge.id}
                editingLabel={editingEdgeId === edge.id}
                showEditUI={!moveMode && (!contextMenu?.edgeId || contextMenu.edgeId !== edge.id)}
                onSelect={() => {
                  if (clearEdgeTimeoutRef.current) {
                    clearTimeout(clearEdgeTimeoutRef.current)
                    clearEdgeTimeoutRef.current = null
                  }
                  setSelectedEdgeId(edge.id)
                }}
                onDoubleClick={() => setEditingEdgeId(edge.id)}
                onLabelChange={(label) => updateEdge(edge.id, { label })}
                onLabelEditEnd={() => setEditingEdgeId(null)}
                onColorChange={(color) => updateEdge(edge.id, { color })}
                onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (clearEdgeTimeoutRef.current) {
                    clearTimeout(clearEdgeTimeoutRef.current)
                    clearEdgeTimeoutRef.current = null
                  }
                  setSelectedEdgeId(edge.id)
                  setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
                }}
                getScreenPoint={(canvasX, canvasY) => {
                  const area = areaRef.current?.getBoundingClientRect()
                  if (!area) return { x: 0, y: 0 }
                  return {
                    x: area.left + viewport.x + canvasX * viewport.zoom,
                    y: area.top + viewport.y + canvasY * viewport.zoom
                  }
                }}
              />
            ))}
            {connectionFromId && connectionCursor && (() => {
              const fromNode = nodes.find((n) => n.id === connectionFromId)
              if (!fromNode) return null
              const x1 = fromNode.x + fromNode.width / 2
              const y1 = fromNode.y + fromNode.height / 2
              const x2 = connectionCursor.x
              const y2 = connectionCursor.y
              const dx = x2 - x1
              const dy = y2 - y1
              const dist = Math.hypot(dx, dy) || 1
              const ctrlOffset = Math.min(dist * 0.5, 80)
              const cx = (x1 + x2) / 2 + (-dy / dist) * ctrlOffset
              const cy = (y1 + y2) / 2 + (dx / dist) * ctrlOffset
              const path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
              return (
                <path
                  d={path}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                />
              )
            })()}
          </svg>
        </div>
        {connectionMode && (
          <div className="canvas-connection-hint">
            {connectionFromId ? 'Click second node to connect' : 'Click first node to connect'}
          </div>
        )}
        {contextMenu?.nodeId && (() => {
          const nid = contextMenu.nodeId
          const contextNode = nodes.find((n) => n.id === nid)
          const isGroup = contextNode?.type === 'group'
          const currentGroup = contextNode && !isGroup ? groupNodes.find((g) => {
            if (g.childIds?.includes(nid)) return true
            return (
              contextNode.x >= g.x &&
              contextNode.y >= g.y &&
              contextNode.x + contextNode.width <= g.x + g.width &&
              contextNode.y + contextNode.height <= g.y + g.height
            )
          }) : undefined
          const nodeInChildIds = currentGroup?.childIds?.includes(nid) ?? false
          return (
            <CanvasContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              nodeId={nid}
              groups={isGroup ? [] : groupNodes.filter((g) => g.id !== nid && g.id !== currentGroup?.id).map((g) => ({ id: g.id, title: g.title || 'Unnamed' }))}
              currentGroupId={currentGroup?.id}
              onClose={() => setContextMenu(null)}
              onDelete={(id) => {
                const node = nodes.find((n) => n.id === id)
                if (node?.type === 'group' && node.childIds?.length) {
                  node.childIds.forEach((cid) => removeNode(cid))
                }
                removeNode(id)
                setSelectedIds((s) => { const n = new Set(s); n.delete(id); if (node?.childIds) node.childIds.forEach((c) => n.delete(c)); return n })
                setContextMenu(null)
              }}
              onAddToGroup={(nodeId, groupId) => {
                const group = nodes.find((n) => n.id === groupId)
                if (!group || group.type !== 'group') return
                const existingChildIds = group.childIds ?? []
                if (!existingChildIds.includes(nodeId)) {
                  updateNode(groupId, { childIds: [...existingChildIds, nodeId] })
                }
              }}
              onRemoveFromGroup={(nodeId, groupId) => {
                const group = nodes.find((n) => n.id === groupId)
                if (!group || group.type !== 'group') return
                const newChildIds = (group.childIds ?? []).filter((cid) => cid !== nodeId)
                updateNode(groupId, { childIds: newChildIds })
                const node = nodes.find((n) => n.id === nodeId)
                if (node) {
                  updateNode(nodeId, { x: node.x + group.width + 20, y: node.y })
                }
              }}
            />
          )
        })()}
        {contextMenu?.edgeId && (
          <CanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            edgeId={contextMenu.edgeId}
            onClose={() => setContextMenu(null)}
            onDeleteEdge={(edgeId: string) => {
              removeEdge(edgeId)
              setSelectedEdgeId(null)
              setEditingEdgeId(null)
              setContextMenu(null)
            }}
          />
        )}
        {addLinkDialog && (
          <div
            className="canvas-add-link-backdrop"
            onClick={() => { setAddLinkDialog(null); setAddLinkUrl('') }}
            role="presentation"
          >
            <div
              className="canvas-add-link-dialog"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Add link"
            >
              <label className="canvas-add-link-label" htmlFor="canvas-add-link-url">Enter URL (website or YouTube)</label>
              <input
                id="canvas-add-link-url"
                ref={addLinkInputRef}
                type="url"
                className="canvas-add-link-input"
                value={addLinkUrl}
                onChange={(e) => setAddLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddLinkSubmit()
                  }
                }}
                placeholder="https://"
              />
              <div className="canvas-add-link-actions">
                <button
                  type="button"
                  className="canvas-add-link-btn canvas-add-link-cancel"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setAddLinkDialog(null)
                    setAddLinkUrl('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="canvas-add-link-btn canvas-add-link-submit"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleAddLinkSubmit()
                  }}
                >
                  Add link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
