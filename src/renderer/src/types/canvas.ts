/** Canvas artifact file format and runtime types */

export type CanvasNodeType = 'text' | 'file' | 'link' | 'image' | 'group'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  content: string
  title?: string
  color?: string
  backgroundColor?: string
  childIds?: string[]
  /** When true, link nodes show the URL in an iframe (embed) instead of card preview. */
  embed?: boolean
}

export interface CanvasEdge {
  id: string
  from: string
  to: string
  label?: string
  color?: string
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasData {
  version: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
}

export const DEFAULT_CANVAS: CanvasData = {
  version: 1,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
}

export function parseCanvasContent(raw: string): CanvasData {
  try {
    const data = JSON.parse(raw) as Partial<CanvasData>
    return {
      version: data.version ?? 1,
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      viewport: data.viewport && typeof data.viewport === 'object'
        ? {
            x: Number(data.viewport.x) || 0,
            y: Number(data.viewport.y) || 0,
            zoom: Number(data.viewport.zoom) || 1
          }
        : { x: 0, y: 0, zoom: 1 }
    }
  } catch {
    return { ...DEFAULT_CANVAS }
  }
}

export function serializeCanvas(data: CanvasData): string {
  return JSON.stringify(data, null, 2)
}
