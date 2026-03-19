import * as dagre from 'dagre'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceCenter,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from 'd3-force'
import type { CanvasNode, CanvasEdge, CanvasData } from '../../types/canvas'

export type AutoLayoutMode = 'grid' | 'tree' | 'force'

const GRID_SNAP = 24
const GROUP_PAD = 20
const GROUP_HEADER = 36

function snap(v: number): number {
  return Math.round(v / GRID_SNAP) * GRID_SNAP
}

/** Non-group nodes to lay out; edges only between these ids */
function getLayableSet(
  nodes: CanvasNode[],
  selectedIds: Set<string>
): { layable: CanvasNode[]; idSet: Set<string> } {
  const nonGroup = nodes.filter((n) => n.type !== 'group')
  const selectedNonGroup = nonGroup.filter((n) => selectedIds.has(n.id))
  const layable =
    selectedNonGroup.length >= 2 ? selectedNonGroup : nonGroup
  return { layable, idSet: new Set(layable.map((n) => n.id)) }
}

function filterEdges(edges: CanvasEdge[], idSet: Set<string>): CanvasEdge[] {
  return edges.filter((e) => idSet.has(e.from) && idSet.has(e.to))
}

/** Average center of layable nodes (for stabilizing position after layout) */
function centroid(nodes: CanvasNode[]): { cx: number; cy: number } {
  if (!nodes.length) return { cx: 0, cy: 0 }
  let sx = 0
  let sy = 0
  for (const n of nodes) {
    sx += n.x + n.width / 2
    sy += n.y + n.height / 2
  }
  return { cx: sx / nodes.length, cy: sy / nodes.length }
}

function layoutGrid(layable: CanvasNode[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!layable.length) return out

  const maxW = Math.max(...layable.map((n) => n.width))
  const maxH = Math.max(...layable.map((n) => n.height))
  const gapX = Math.max(80, Math.round(maxW * 0.15))
  const gapY = Math.max(80, Math.round(maxH * 0.15))
  const cellW = maxW + gapX
  const cellH = maxH + gapY
  const cols = Math.ceil(Math.sqrt(layable.length))

  layable.forEach((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    out.set(n.id, {
      x: col * cellW,
      y: row * cellH
    })
  })
  return out
}

function layoutDagre(layable: CanvasNode[], edges: CanvasEdge[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!layable.length) return out

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    ranksep: 80,
    marginx: 20,
    marginy: 20
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of layable) {
    g.setNode(n.id, { width: n.width, height: n.height })
  }

  const edgeKeys = new Set<string>()
  for (const e of edges) {
    const key = `${e.from}|${e.to}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    try {
      g.setEdge(e.from, e.to)
    } catch {
      /* skip invalid */
    }
  }

  // Isolated nodes: dagre still lays them out; if no edges at all, fall back to grid
  if (edges.length === 0) {
    return layoutGrid(layable)
  }

  try {
    dagre.layout(g)
  } catch {
    return layoutGrid(layable)
  }

  for (const n of layable) {
    const node = g.node(n.id)
    if (!node) continue
    // dagre gives center x,y
    const x = node.x - n.width / 2
    const y = node.y - n.height / 2
    out.set(n.id, { x, y })
  }

  return out
}

interface SimNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
}

function layoutForce(layable: CanvasNode[], edges: CanvasEdge[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!layable.length) return out

  const idSet = new Set(layable.map((n) => n.id))
  const simNodes: SimNode[] = layable.map((n) => ({
    id: n.id,
    width: n.width,
    height: n.height,
    x: n.x + n.width / 2,
    y: n.y + n.height / 2
  }))

  const links: SimulationLinkDatum<SimNode>[] = edges
    .filter((e) => idSet.has(e.from) && idSet.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }))

  const linkForce = forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
    .id((d) => d.id)
    .distance(140)
    .strength(0.65)

  const sim = forceSimulation<SimNode>(simNodes)
    .force('link', linkForce)
    .force('charge', forceManyBody<SimNode>().strength(-900))
    .force(
      'collide',
      forceCollide<SimNode>().radius((d) => Math.hypot(d.width, d.height) / 2 + 28)
    )
    .force('center', forceCenter(500, 400))
    .alphaDecay(0.022)
    .velocityDecay(0.38)

  for (let i = 0; i < 450; i++) sim.tick()
  sim.stop()

  for (const d of simNodes) {
    const cx = d.x ?? 0
    const cy = d.y ?? 0
    out.set(d.id, {
      x: cx - d.width / 2,
      y: cy - d.height / 2
    })
  }

  return out
}

/** Resize groups to wrap childIds after children moved */
function refitGroupNodes(nodes: CanvasNode[]): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return nodes.map((node) => {
    if (node.type !== 'group' || !node.childIds?.length) return node
    const children = node.childIds
      .map((id) => byId.get(id))
      .filter((c): c is CanvasNode => !!c && c.type !== 'group')
    if (!children.length) return node

    const minX = Math.min(...children.map((c) => c.x))
    const minY = Math.min(...children.map((c) => c.y))
    const maxX = Math.max(...children.map((c) => c.x + c.width))
    const maxY = Math.max(...children.map((c) => c.y + c.height))

    return {
      ...node,
      x: snap(minX - GROUP_PAD),
      y: snap(minY - GROUP_PAD - GROUP_HEADER),
      width: Math.max(snap(maxX - minX + GROUP_PAD * 2), GRID_SNAP * 8),
      height: Math.max(
        snap(maxY - minY + GROUP_PAD * 2 + GROUP_HEADER),
        GRID_SNAP * 6
      )
    }
  })
}

/**
 * Apply auto-layout to canvas data. Uses selection if 2+ non-group nodes selected; otherwise all non-group nodes.
 */
export function applyAutoLayout(
  data: CanvasData,
  mode: AutoLayoutMode,
  selectedIds: Set<string>
): CanvasData {
  const { layable, idSet } = getLayableSet(data.nodes, selectedIds)
  if (layable.length === 0) return data

  const { cx: oldCx, cy: oldCy } = centroid(layable)
  const edges = filterEdges(data.edges, idSet)

  let posMap: Map<string, { x: number; y: number }>
  switch (mode) {
    case 'grid':
      posMap = layoutGrid(layable)
      break
    case 'tree':
      posMap = layoutDagre(layable, edges)
      break
    case 'force':
      posMap = layoutForce(layable, edges)
      break
    default:
      posMap = layoutGrid(layable)
  }

  const newCentroid = { cx: 0, cy: 0 }
  let count = 0
  for (const n of layable) {
    const p = posMap.get(n.id)
    if (!p) continue
    newCentroid.cx += p.x + n.width / 2
    newCentroid.cy += p.y + n.height / 2
    count++
  }
  if (count > 0) {
    newCentroid.cx /= count
    newCentroid.cy /= count
  }
  const dx = oldCx - newCentroid.cx
  const dy = oldCy - newCentroid.cy

  const nextNodes: CanvasNode[] = data.nodes.map((n) => {
    if (n.type === 'group') return n
    const p = posMap.get(n.id)
    if (!p) return n
    return {
      ...n,
      x: snap(Math.max(0, p.x + dx)),
      y: snap(Math.max(0, p.y + dy))
    }
  })

  const withGroups = refitGroupNodes(nextNodes)

  return {
    ...data,
    nodes: withGroups
  }
}
