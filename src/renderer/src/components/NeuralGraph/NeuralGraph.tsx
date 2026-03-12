import { useRef, useEffect, useState, useCallback } from 'react'
import { Maximize2, Minimize2, Scan } from 'lucide-react'
import * as d3 from 'd3'
import { useWorkspace } from '../../store/useWorkspace'
import type { FolderNode } from '../../types'
import './NeuralGraph.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  kind: 'file' | 'folder'
  depth: number
  radius: number
  treeNode: FolderNode
}

interface SimLink {
  source: GraphNode
  target: GraphNode
  type: 'structural' | 'neural'
  bidirectional?: boolean
}

interface RawLink {
  source: string
  target: string
  type: 'structural' | 'neural'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenTree(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.kind === 'folder') out.push(...flattenTree(n.children))
  }
  return out
}

function resolvePath(fromDir: string, rel: string): string {
  const parts = (fromDir + '/' + rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return '/' + out.join('/')
}

function parseLinks(content: string, filePath: string, pathSet: Set<string>): string[] {
  const targets: string[] = []
  const fromDir = filePath.substring(0, filePath.lastIndexOf('/'))

  const mdRe = /\[([^\]]*)\]\(([^)\s]+\.md[^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = mdRe.exec(content)) !== null) {
    const href = m[2].split('#')[0]
    if (href.startsWith('http')) continue
    const abs = resolvePath(fromDir, href)
    if (pathSet.has(abs) && abs !== filePath) targets.push(abs)
  }

  const wikiRe = /\[\[([^\]|#]+?)(?:\.md)?(?:\|[^\]]+)?\]\]/g
  while ((m = wikiRe.exec(content)) !== null) {
    const noteName = m[1].trim()
    for (const p of pathSet) {
      if (p === filePath) continue
      const base = p.split('/').pop()?.replace(/\.md$/i, '') ?? ''
      if (base === noteName || p.endsWith('/' + noteName + '.md') || p.endsWith('/' + noteName)) {
        targets.push(p)
        break
      }
    }
  }
  return targets
}

async function buildGraphData(
  tree: FolderNode[]
): Promise<{ nodes: GraphNode[]; rawLinks: RawLink[] }> {
  const all = flattenTree(tree)
  const pathSet = new Set(all.map((n) => n.path))

  const nodes: GraphNode[] = all.map((n) => ({
    id: n.path,
    name: n.name,
    kind: n.kind,
    depth: n.depth,
    radius: n.kind === 'folder' ? Math.max(22, 14 + n.children.length * 2.5) : 12,
    treeNode: n,
  }))

  const rawLinks: RawLink[] = []
  for (const n of all) {
    const parentPath = n.path.substring(0, n.path.lastIndexOf('/'))
    if (parentPath && pathSet.has(parentPath)) {
      rawLinks.push({ source: parentPath, target: n.path, type: 'structural' })
    }
  }

  // Neural links — deduplicated: A↔B becomes one link flagged bidirectional
  const neuralSeen = new Map<string, RawLink>()
  const mdFiles = all.filter((n) => n.kind === 'file' && /\.(md|markdown)$/i.test(n.name))
  await Promise.all(
    mdFiles.map(async (file) => {
      const res = await window.asterisk.readFile(file.path)
      if (!res.ok || !res.data) return
      const targets = parseLinks(res.data.content, file.path, pathSet)
      for (const t of targets) {
        const fwd = `${file.path}|||${t}`
        const rev = `${t}|||${file.path}`
        if (neuralSeen.has(rev)) {
          // Mark existing reverse link as bidirectional instead of adding a duplicate
          neuralSeen.get(rev)!.source += '' // no-op, just mark via object mutation below
            ; (neuralSeen.get(rev) as RawLink & { bidirectional?: boolean }).bidirectional = true
        } else if (!neuralSeen.has(fwd)) {
          neuralSeen.set(fwd, { source: file.path, target: t, type: 'neural' })
        }
      }
    })
  )

  rawLinks.push(...neuralSeen.values())
  return { nodes, rawLinks }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NeuralGraphProps {
  query?: string
  selectedTagIds?: string[]
}

export default function NeuralGraph({ query = '', selectedTagIds = [] }: NeuralGraphProps) {
  const tree = useWorkspace((s) => s.tree)
  const fileTags = useWorkspace((s) => s.fileTags)
  const openFileNode = useWorkspace((s) => s.openFileNode)
  const openFileNodeRef = useRef(openFileNode)
  useEffect(() => { openFileNodeRef.current = openFileNode }, [openFileNode])

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const [loading, setLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; rawLinks: RawLink[] } | null>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  // Build graph when tree changes
  useEffect(() => {
    if (!tree.length) return
    setLoading(true)
    buildGraphData(tree).then((data) => { setGraphData(data); setLoading(false) })
  }, [tree])

  // Track container size (re-attaches on fullscreen change)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const { offsetWidth: w, offsetHeight: h } = container
      if (w > 0 && h > 0) setDims({ w, h })
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(container)
    return () => obs.disconnect()
  }, [isFullscreen])

  // Escape exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [isFullscreen])

  // Filter nodes by query/tags without re-running simulation
  useEffect(() => {
    if (!svgRef.current) return
    const q = query.toLowerCase()
    const isFiltered = q || selectedTagIds.length > 0
    d3.select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>('.ng-node')
      .attr('opacity', (d) => {
        const matchesQuery = !q || d.name.replace(/\.md$/i, '').toLowerCase().includes(q)
        const matchesTags = selectedTagIds.length === 0 ||
          selectedTagIds.some(id => (fileTags[d.id] ?? []).includes(id))
        return matchesQuery && matchesTags ? 1 : 0.08
      })
    d3.select(svgRef.current)
      .selectAll('line.ng-link')
      .attr('opacity', isFiltered ? 0.06 : null)
  }, [query, selectedTagIds, fileTags])

  // Fit all nodes into view
  const fitView = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl || !zoomRef.current || !dims.w) return
    const inner = svgEl.querySelector('g') as SVGGElement | null
    if (!inner) return
    const bbox = inner.getBBox()
    if (!bbox.width || !bbox.height) return
    const pad = 48
    const scale = Math.min(
      (dims.w - pad * 2) / bbox.width,
      (dims.h - pad * 2) / bbox.height,
      2.5
    )
    const tx = dims.w / 2 - (bbox.x + bbox.width / 2) * scale
    const ty = dims.h / 2 - (bbox.y + bbox.height / 2) * scale
    d3.select(svgEl)
      .transition().duration(700)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }, [dims])

  // D3 initialisation — reruns when graphData or dims change
  useEffect(() => {
    const svgEl = svgRef.current
    if (!graphData || !svgEl || graphData.nodes.length === 0 || dims.w === 0) return

    const { w: width, h: height } = dims

    // Live theme colors
    const css = getComputedStyle(document.documentElement)
    const v = (n: string, fb: string) => css.getPropertyValue(n).trim() || fb
    const accent = v('--accent', '#ffffff')
    const bgBase = v('--bg-base', '#000000')
    const bgSurface = v('--bg-surface', '#0a0a0a')
    const bgElevated = v('--bg-elevated', '#141414')
    const border = v('--border', '#262626')
    const textMuted = v('--text-muted', '#737373')
    const textSecondary = v('--text-secondary', '#a3a3a3')
    const fontUi = v('--font-ui', 'system-ui, sans-serif')

    // ── SVG ───────────────────────────────────────────────────────────────────
    const sel = d3.select(svgEl).attr('width', width).attr('height', height)
    sel.selectAll('*').remove()

    const defs = sel.append('defs')
    const addGlow = (id: string, dev: number, color: string) => {
      const f = defs.append('filter').attr('id', id)
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%')
      f.append('feFlood').attr('flood-color', color).attr('flood-opacity', 0.9).attr('result', 'c')
      f.append('feComposite').attr('in', 'c').attr('in2', 'SourceGraphic').attr('operator', 'in').attr('result', 'cb')
      f.append('feGaussianBlur').attr('in', 'cb').attr('stdDeviation', dev).attr('result', 'b')
      const m = f.append('feMerge')
      m.append('feMergeNode').attr('in', 'b')
      m.append('feMergeNode').attr('in', 'SourceGraphic')
    }
    // Keep glow only on neural links; nodes themselves no longer use glow filters
    addGlow('ng-glow-link', 2, accent)


    // ── Zoom ──────────────────────────────────────────────────────────────────
    const g = sel.append('g')
    const zoom = (d3.zoom() as d3.ZoomBehavior<SVGSVGElement, unknown>)
      .scaleExtent([0.05, 6])
      .on('zoom', (e) => g.attr('transform', e.transform))
    sel.call(zoom)
    zoomRef.current = zoom

    // ── Build nodes + links ───────────────────────────────────────────────────
    const simNodes: GraphNode[] = graphData.nodes.map((n) => ({ ...n }))
    const nodeById = new Map(simNodes.map((n) => [n.id, n]))

    // Initial positions: concentric rings by depth for better starting layout
    const byDepth = new Map<number, GraphNode[]>()
    for (const n of simNodes) {
      const arr = byDepth.get(n.depth) ?? []; arr.push(n); byDepth.set(n.depth, arr)
    }
    for (const [depth, nodesAtDepth] of byDepth) {
      const ringR = depth === 0 ? 0 : Math.min(width, height) * 0.12 * depth
      nodesAtDepth.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodesAtDepth.length - Math.PI / 2
        n.x = width / 2 + Math.cos(angle) * ringR + (Math.random() - 0.5) * 40
        n.y = height / 2 + Math.sin(angle) * ringR + (Math.random() - 0.5) * 40
      })
    }

    const simLinks: SimLink[] = (graphData.rawLinks as Array<RawLink & { bidirectional?: boolean }>)
      .map((l) => {
        const src = nodeById.get(l.source)
        const tgt = nodeById.get(l.target)
        return src && tgt ? { source: src, target: tgt, type: l.type, bidirectional: l.bidirectional } : null
      })
      .filter(Boolean) as SimLink[]

    // ── Adjacency map (for hover highlight) ───────────────────────────────────
    const adjacency = new Map<string, Set<string>>()
    for (const l of simLinks) {
      const a = adjacency.get(l.source.id) ?? new Set<string>()
      const b = adjacency.get(l.target.id) ?? new Set<string>()
      a.add(l.target.id); b.add(l.source.id)
      adjacency.set(l.source.id, a)
      adjacency.set(l.target.id, b)
    }

    // ── Links ─────────────────────────────────────────────────────────────────
    const linkEls = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'ng-link')
      .attr('stroke', (d) => d.type === 'neural' ? accent : border)
      .attr('stroke-width', (d) => d.type === 'neural' ? (d.bidirectional ? 2 : 1.5) : 1)
      .attr('stroke-opacity', (d) => d.type === 'neural' ? 0.7 : 0.4)
      .attr('stroke-dasharray', (d) => d.type === 'neural' && !d.bidirectional ? '6 4' : null)
      .attr('filter', (d) => d.type === 'neural' ? 'url(#ng-glow-link)' : null)
      .classed('ng-neural-dash', (d) => d.type === 'neural' && !d.bidirectional)

    // ── Nodes ─────────────────────────────────────────────────────────────────
    const nodeEls = g.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes)
      .join('g')
      .attr('class', (d) => `ng-node ng-node--${d.kind}`)
      .attr('cursor', (d) => (d.kind === 'file' ? 'pointer' : 'grab'))

    nodeEls.append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => d.kind === 'folder' ? bgElevated : bgSurface)
      .attr('stroke', (d) => d.kind === 'folder' ? accent : border)
      .attr('stroke-width', (d) => d.kind === 'folder' ? 2 : 1)

    // Label with dark halo stroke so text is readable over any background
    nodeEls.append('text')
      .attr('dy', (d) => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => d.kind === 'folder' ? 11 : 10)
      .attr('font-family', fontUi)
      .attr('fill', (d) => d.kind === 'folder' ? textSecondary : textMuted)
      .attr('opacity', (d) => d.kind === 'folder' ? 0.95 : 0.65)
      .attr('paint-order', 'stroke')
      .attr('stroke', bgBase)
      .attr('stroke-width', 5)
      .attr('stroke-linejoin', 'round')
      .attr('pointer-events', 'none')
      .text((d) => {
        const name = d.name.replace(/\.md$/i, '')
        return name.length > 17 ? name.slice(0, 15) + '…' : name
      })

    // ── Simulation ────────────────────────────────────────────────────────────
    const simulation = d3
      .forceSimulation<GraphNode>(simNodes)
      .alphaDecay(0.012)
      .velocityDecay(0.55)
      .force(
        'link',
        d3.forceLink<GraphNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => d.type === 'neural' ? 200 : 95)
          .strength((d) => d.type === 'neural' ? 0.08 : 0.6)
      )
      .force('charge', d3.forceManyBody<GraphNode>().strength((d) => d.kind === 'folder' ? -380 : -100))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.025))
      .force('collision', d3.forceCollide<GraphNode>((d) => d.radius + 10))
      .on('tick', () => {
        linkEls
          .attr('x1', (d) => d.source.x ?? 0).attr('y1', (d) => d.source.y ?? 0)
          .attr('x2', (d) => d.target.x ?? 0).attr('y2', (d) => d.target.y ?? 0)
        nodeEls.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    // ── Drag ──────────────────────────────────────────────────────────────────
    nodeEls.call(
      d3.drag<SVGGElement, GraphNode>()
        .on('start', (e, d) => {
          if (!e.active) simulation.alphaTarget(0.2).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => {
          if (!e.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        })
    )

    // ── Hover ─────────────────────────────────────────────────────────────────
    nodeEls
      .on('mouseenter', function (_, d) {
        const circle = d3.select(this).select<SVGCircleElement>('circle')
        const label = d3.select(this).select<SVGTextElement>('text')
        const neighbors = adjacency.get(d.id) ?? new Set<string>()

        // Hide unconnected links completely; thicken + fully show connected ones
        linkEls
          .attr('opacity', (l) => l.source.id === d.id || l.target.id === d.id ? 1 : 0)
          .attr('stroke-width', (l) => {
            if (l.source.id !== d.id && l.target.id !== d.id) return null
            return l.type === 'neural' ? (l.bidirectional ? 3 : 2.5) : 2
          })
        // Dim (not hide) unconnected nodes so layout stays readable
        nodeEls.attr('opacity', (n) => n.id === d.id || neighbors.has(n.id) ? 1 : 0.12)

        if (d.kind === 'folder') {
          d.fx = d.x; d.fy = d.y   // pin — prevents fleeing
          const childIds = new Set(
            simLinks.filter((l) => l.type === 'structural' && l.source.id === d.id).map((l) => l.target.id)
          )
          simulation
            .force('radial-hover',
              d3.forceRadial<GraphNode>(d.radius * 3.2, d.fx ?? 0, d.fy ?? 0)
                .strength((n) => childIds.has(n.id) ? 0.3 : 0)
            )
            .alpha(0.3).restart()
          circle.attr('stroke-width', 3)
          label.attr('fill', accent).attr('opacity', 1).attr('font-size', 12)
        } else {
          circle.attr('stroke', accent).attr('stroke-width', 2)
          label.attr('fill', accent).attr('opacity', 1)
        }
      })
      .on('mouseleave', function (_, d) {
        const circle = d3.select(this).select<SVGCircleElement>('circle')
        const label = d3.select(this).select<SVGTextElement>('text')

        // Restore all opacities and stroke-widths
        nodeEls.attr('opacity', null)
        linkEls
          .attr('opacity', null)
          .attr('stroke-width', (l) => l.type === 'neural' ? (l.bidirectional ? 2 : 1.5) : 1)

        if (d.kind === 'folder') {
          d.fx = null; d.fy = null
          simulation.force('radial-hover', null).alpha(0.1).restart()
          circle.attr('stroke-width', 2)
          label.attr('fill', textSecondary).attr('opacity', 0.95).attr('font-size', 11)
        } else {
          circle.attr('stroke', border).attr('stroke-width', 1)
          label.attr('fill', textMuted).attr('opacity', 0.65)
        }
      })

    // ── Click to open ─────────────────────────────────────────────────────────
    nodeEls.on('click', (e, d) => {
      e.stopPropagation()
      if (d.kind !== 'file') return
      openFileNodeRef.current(d.treeNode)
    })

    return () => { simulation.stop() }
  }, [graphData, dims])

  if (!tree.length) {
    return <div className="ng-empty"><p>Open a folder to see the neural graph.</p></div>
  }

  return (
    <div ref={containerRef} className={`ng-container${isFullscreen ? ' ng-fullscreen' : ''}`}>
      {loading && (
        <div className="ng-loading">
          <div className="ng-spinner" />
          <span>Scanning links…</span>
        </div>
      )}

      <svg ref={svgRef} className="ng-svg" />

      {/* Toolbar */}
      <div className="ng-toolbar">
        <button className="ng-toolbar-btn" onClick={fitView} title="Fit all nodes in view">
          <Scan size={13} strokeWidth={1.7} />
        </button>
        <button
          className="ng-toolbar-btn"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={13} strokeWidth={1.7} /> : <Maximize2 size={13} strokeWidth={1.7} />}
        </button>
      </div>

      <div className="ng-hint">Scroll to zoom · Drag to pan · Click file to open · Hover folder to expand</div>
    </div>
  )
}
