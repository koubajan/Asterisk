import { create } from 'zustand'
import type { CanvasData, CanvasNode, CanvasEdge, CanvasViewport } from '../types/canvas'
import { parseCanvasContent, serializeCanvas, DEFAULT_CANVAS } from '../types/canvas'

function genId(): string {
  return Math.random().toString(36).slice(2, 12)
}

interface ArtifactsState {
  /** Path of the currently open canvas file, or null if none. */
  canvasPath: string | null
  data: CanvasData
  isDirty: boolean

  loadCanvas: (path: string, content: string) => void
  closeCanvas: () => void
  setData: (data: CanvasData) => void
  addNode: (node: Omit<CanvasNode, 'id'>) => void
  updateNode: (id: string, updates: Partial<CanvasNode>) => void
  removeNode: (id: string) => void
  addEdge: (from: string, to: string, label?: string) => void
  updateEdge: (id: string, updates: Partial<CanvasEdge>) => void
  removeEdge: (id: string) => void
  setViewport: (viewport: Partial<CanvasViewport>) => void
  markSaved: () => void
}

export const useArtifacts = create<ArtifactsState>((set, get) => ({
  canvasPath: null,
  data: { ...DEFAULT_CANVAS },
  isDirty: false,

  loadCanvas: (path, content) => {
    const data = parseCanvasContent(content)
    set({ canvasPath: path, data, isDirty: false })
  },

  closeCanvas: () => set({ canvasPath: null, data: { ...DEFAULT_CANVAS }, isDirty: false }),

  setData: (data) => set({ data, isDirty: true }),

  addNode: (node) => set((s) => {
    const id = `node-${genId()}`
    const newNode: CanvasNode = { ...node, id }
    return {
      data: {
        ...s.data,
        nodes: [...s.data.nodes, newNode]
      },
      isDirty: true
    }
  }),

  updateNode: (id, updates) => set((s) => ({
    data: {
      ...s.data,
      nodes: s.data.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n))
    },
    isDirty: true
  })),

  removeNode: (id) => set((s) => ({
    data: {
      ...s.data,
      nodes: s.data.nodes.filter((n) => n.id !== id),
      edges: s.data.edges.filter((e) => e.from !== id && e.to !== id)
    },
    isDirty: true
  })),

  addEdge: (from, to, label) => set((s) => {
    const id = `edge-${genId()}`
    const newEdge: CanvasEdge = { id, from, to, label }
    return {
      data: { ...s.data, edges: [...s.data.edges, newEdge] },
      isDirty: true
    }
  }),

  updateEdge: (id, updates) => set((s) => ({
    data: {
      ...s.data,
      edges: s.data.edges.map((e) => (e.id === id ? { ...e, ...updates } : e))
    },
    isDirty: true
  })),

  removeEdge: (id) => set((s) => ({
    data: {
      ...s.data,
      edges: s.data.edges.filter((e) => e.id !== id)
    },
    isDirty: true
  })),

  setViewport: (viewport) => set((s) => ({
    data: {
      ...s.data,
      viewport: { ...s.data.viewport, ...viewport }
    },
    isDirty: true
  })),

  markSaved: () => set({ isDirty: false })
}))

export function getCanvasContentForSave(): string | null {
  const { canvasPath, data } = useArtifacts.getState()
  if (!canvasPath) return null
  return serializeCanvas(data)
}
