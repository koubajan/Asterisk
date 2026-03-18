import type { CanvasNode, CanvasEdge } from '../../types/canvas'

const PADDING = 40 // px around exported image content
const BACKGROUND_COLOR = '#1a1a1a'
const NODE_BG_COLOR = '#252525'
const NODE_BORDER_COLOR = '#333333'
const TEXT_COLOR = '#e0e0e0'
const EDGE_COLOR = '#666666'
const GROUP_BG_COLOR = 'rgba(80, 80, 80, 0.2)'
const GROUP_BORDER_COLOR = '#555555'

interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function calculateBoundingBox(nodes: CanvasNode[]): BoundingBox {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }

  return { minX, minY, maxX, maxY }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) {
    lines.push(currentLine)
  }
  return lines
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  offsetX: number,
  offsetY: number
): void {
  const x = node.x - offsetX
  const y = node.y - offsetY
  const { width, height } = node
  const radius = 6

  if (node.type === 'group') {
    ctx.fillStyle = GROUP_BG_COLOR
    drawRoundedRect(ctx, x, y, width, height, radius)
    ctx.fill()
    ctx.strokeStyle = GROUP_BORDER_COLOR
    ctx.lineWidth = 1
    ctx.stroke()

    if (node.title) {
      ctx.fillStyle = TEXT_COLOR
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(node.title, x + 8, y + 18)
    }
    return
  }

  ctx.fillStyle = NODE_BG_COLOR
  drawRoundedRect(ctx, x, y, width, height, radius)
  ctx.fill()
  ctx.strokeStyle = NODE_BORDER_COLOR
  ctx.lineWidth = 1
  ctx.stroke()

  const padding = 12
  const contentWidth = width - padding * 2
  const contentX = x + padding
  let contentY = y + padding

  if (node.title) {
    ctx.fillStyle = TEXT_COLOR
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(node.title, contentX, contentY + 12)
    contentY += 24
  }

  if (node.type === 'text' && node.content) {
    ctx.fillStyle = TEXT_COLOR
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const lines = wrapText(ctx, node.content, contentWidth)
    const lineHeight = 16
    const maxLines = Math.floor((height - (contentY - y) - padding) / lineHeight)
    const visibleLines = lines.slice(0, maxLines)
    
    for (let i = 0; i < visibleLines.length; i++) {
      ctx.fillText(visibleLines[i], contentX, contentY + 12 + i * lineHeight)
    }
    if (lines.length > maxLines) {
      ctx.fillStyle = '#888888'
      ctx.fillText('...', contentX, contentY + 12 + maxLines * lineHeight)
    }
  } else if (node.type === 'file' && node.content) {
    ctx.fillStyle = '#888888'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const fileName = node.content.split('/').pop() || node.content
    ctx.fillText(fileName, contentX, contentY + 12)
  } else if (node.type === 'link' && node.content) {
    ctx.fillStyle = '#6699cc'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const displayUrl = node.content.replace(/^https?:\/\//, '').slice(0, 40)
    ctx.fillText(displayUrl + (node.content.length > 40 ? '...' : ''), contentX, contentY + 12)
  } else if (node.type === 'image' && node.content) {
    ctx.fillStyle = '#888888'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('[Image]', contentX, contentY + 12)
  }
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: CanvasEdge,
  nodes: CanvasNode[],
  offsetX: number,
  offsetY: number
): void {
  const fromNode = nodes.find((n) => n.id === edge.from)
  const toNode = nodes.find((n) => n.id === edge.to)
  if (!fromNode || !toNode) return

  const x1 = fromNode.x + fromNode.width / 2 - offsetX
  const y1 = fromNode.y + fromNode.height / 2 - offsetY
  const x2 = toNode.x + toNode.width / 2 - offsetX
  const y2 = toNode.y + toNode.height / 2 - offsetY

  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1
  const ctrlOffset = Math.min(dist * 0.3, 60)
  const cx = (x1 + x2) / 2 + (-dy / dist) * ctrlOffset
  const cy = (y1 + y2) / 2 + (dx / dist) * ctrlOffset

  ctx.strokeStyle = edge.color || EDGE_COLOR
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(cx, cy, x2, y2)
  ctx.stroke()

  if (edge.label) {
    const labelX = (x1 + 2 * cx + x2) / 4
    const labelY = (y1 + 2 * cy + y2) / 4
    ctx.fillStyle = BACKGROUND_COLOR
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const metrics = ctx.measureText(edge.label)
    const labelPadding = 4
    ctx.fillRect(
      labelX - metrics.width / 2 - labelPadding,
      labelY - 7 - labelPadding,
      metrics.width + labelPadding * 2,
      14 + labelPadding * 2
    )
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = 'center'
    ctx.fillText(edge.label, labelX, labelY + 4)
    ctx.textAlign = 'left'
  }
}

export async function exportCanvasAsImage(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  defaultName: string
): Promise<void> {
  if (nodes.length === 0) {
    return
  }

  const bbox = calculateBoundingBox(nodes)
  const width = bbox.maxX - bbox.minX + PADDING * 2
  const height = bbox.maxY - bbox.minY + PADDING * 2
  const offsetX = bbox.minX - PADDING
  const offsetY = bbox.minY - PADDING

  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = width * scale
  canvas.height = height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(scale, scale)
  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, width, height)

  for (const edge of edges) {
    drawEdge(ctx, edge, nodes, offsetX, offsetY)
  }

  const groups = nodes.filter((n) => n.type === 'group')
  const nonGroups = nodes.filter((n) => n.type !== 'group')

  for (const group of groups) {
    drawNode(ctx, group, offsetX, offsetY)
  }
  for (const node of nonGroups) {
    drawNode(ctx, node, offsetX, offsetY)
  }

  const dataUrl = canvas.toDataURL('image/png')
  await window.asterisk.saveImage(dataUrl, defaultName)
}
