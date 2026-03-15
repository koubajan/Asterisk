import { create } from 'zustand'
import type { CanvasData, CanvasNode, CanvasEdge, CanvasViewport } from '../types/canvas'
import { parseCanvasContent, serializeCanvas, DEFAULT_CANVAS } from '../types/canvas'

const MAX_HISTORY = 50

function genId(): string {
  return Math.random().toString(36).slice(2, 12)
}

function pushToHistory(state: { data: CanvasData; historyPast: CanvasData[]; historyFuture: CanvasData[] }) {
  return {
    historyPast: [...state.historyPast, state.data].slice(-MAX_HISTORY),
    historyFuture: [] as CanvasData[]
  }
}

interface ArtifactsState {
  /** Path of the currently open canvas file, or null if none. */
  canvasPath: string | null
  data: CanvasData
  isDirty: boolean
  historyPast: CanvasData[]
  historyFuture: CanvasData[]

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
  undo: () => void
  redo: () => void
}

export const useArtifacts = create<ArtifactsState>((set, get) => ({
  canvasPath: null,
  data: { ...DEFAULT_CANVAS },
  isDirty: false,
  historyPast: [],
  historyFuture: [],

  loadCanvas: (path, content) => {
    const data = parseCanvasContent(content)
    set({ canvasPath: path, data, isDirty: false, historyPast: [], historyFuture: [] })
  },

  closeCanvas: () => set({ canvasPath: null, data: { ...DEFAULT_CANVAS }, isDirty: false, historyPast: [], historyFuture: [] }),

  setData: (data) => set((s) => ({ ...pushToHistory(s), data, isDirty: true })),

  addNode: (node) => set((s) => {
    const id = `node-${genId()}`
    const newNode: CanvasNode = { ...node, id }
    return {
      ...pushToHistory(s),
      data: {
        ...s.data,
        nodes: [...s.data.nodes, newNode]
      },
      isDirty: true
    }
  }),

  updateNode: (id, updates) => set((s) => ({
    ...pushToHistory(s),
    data: {
      ...s.data,
      nodes: s.data.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n))
    },
    isDirty: true
  })),

  removeNode: (id) => set((s) => ({
    ...pushToHistory(s),
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
      ...pushToHistory(s),
      data: { ...s.data, edges: [...s.data.edges, newEdge] },
      isDirty: true
    }
  }),

  updateEdge: (id, updates) => set((s) => ({
    ...pushToHistory(s),
    data: {
      ...s.data,
      edges: s.data.edges.map((e) => (e.id === id ? { ...e, ...updates } : e))
    },
    isDirty: true
  })),

  removeEdge: (id) => set((s) => ({
    ...pushToHistory(s),
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

  markSaved: () => set({ isDirty: false }),

  undo: () => set((s) => {
    if (s.historyPast.length === 0) return s
    const prev = s.historyPast[s.historyPast.length - 1]
    return {
      data: prev,
      historyPast: s.historyPast.slice(0, -1),
      historyFuture: [s.data, ...s.historyFuture],
      isDirty: true
    }
  }),

  redo: () => set((s) => {
    if (s.historyFuture.length === 0) return s
    const next = s.historyFuture[0]
    return {
      data: next,
      historyPast: [...s.historyPast, s.data],
      historyFuture: s.historyFuture.slice(1),
      isDirty: true
    }
  })
}))

export function getCanvasContentForSave(): string | null {
  const { canvasPath, data } = useArtifacts.getState()
  if (!canvasPath) return null
  return serializeCanvas(data)
}
