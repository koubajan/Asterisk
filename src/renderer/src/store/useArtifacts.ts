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
  
  /** Presentation mode state */
  presentationMode: boolean
  presentationIndex: number
  presentationOrder: string[] // node IDs in presentation order

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
  
  /** Presentation mode actions */
  startPresentation: () => void
  stopPresentation: () => void
  nextSlide: () => void
  prevSlide: () => void
  goToSlide: (index: number) => void
}

function computePresentationOrder(nodes: CanvasNode[]): string[] {
  // Filter out groups, sort by position (top-to-bottom, left-to-right)
  const presentableNodes = nodes.filter(n => n.type !== 'group')
  return presentableNodes
    .sort((a, b) => {
      // Primary sort by Y (top to bottom)
      const yDiff = a.y - b.y
      if (Math.abs(yDiff) > 50) return yDiff
      // Secondary sort by X (left to right)
      return a.x - b.x
    })
    .map(n => n.id)
}

export const useArtifacts = create<ArtifactsState>((set, get) => ({
  canvasPath: null,
  data: { ...DEFAULT_CANVAS },
  isDirty: false,
  historyPast: [],
  historyFuture: [],
  presentationMode: false,
  presentationIndex: 0,
  presentationOrder: [],

  loadCanvas: (path, content) => {
    const data = parseCanvasContent(content)
    set({ canvasPath: path, data, isDirty: false, historyPast: [], historyFuture: [], presentationMode: false, presentationIndex: 0, presentationOrder: [] })
  },

  closeCanvas: () => set({ canvasPath: null, data: { ...DEFAULT_CANVAS }, isDirty: false, historyPast: [], historyFuture: [], presentationMode: false, presentationIndex: 0, presentationOrder: [] }),

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
  }),

  startPresentation: () => {
    const { data } = get()
    const order = computePresentationOrder(data.nodes)
    if (order.length === 0) return
    set({ presentationMode: true, presentationIndex: 0, presentationOrder: order })
  },

  stopPresentation: () => set({ presentationMode: false, presentationIndex: 0, presentationOrder: [] }),

  nextSlide: () => set((s) => {
    if (!s.presentationMode) return s
    const nextIndex = Math.min(s.presentationIndex + 1, s.presentationOrder.length - 1)
    return { presentationIndex: nextIndex }
  }),

  prevSlide: () => set((s) => {
    if (!s.presentationMode) return s
    const prevIndex = Math.max(s.presentationIndex - 1, 0)
    return { presentationIndex: prevIndex }
  }),

  goToSlide: (index: number) => set((s) => {
    if (!s.presentationMode) return s
    const clampedIndex = Math.max(0, Math.min(index, s.presentationOrder.length - 1))
    return { presentationIndex: clampedIndex }
  })
}))

export function getCanvasContentForSave(): string | null {
  const { canvasPath, data } = useArtifacts.getState()
  if (!canvasPath) return null
  return serializeCanvas(data)
}
