import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FolderNode, EditorFile } from '../types'
import { parseFrontmatter, serializeFrontmatter, setScheduled as setScheduledFm } from '../utils/frontmatter'

export interface WorkspaceFolder {
  path: string
  name: string
}

export interface CustomTag {
  id: string
  name: string
  color: string
}

const TAG_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#06b6d4']

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const MAX_OPEN_TABS = 20

interface WorkspaceState {
  workspaces: WorkspaceFolder[]
  activeWorkspaceIndex: number

  tree: FolderNode[]
  openFiles: EditorFile[]
  activeFileIndex: number
  isEditing: boolean
  previewVisible: boolean
  sidebarVisible: boolean
  isLoading: boolean
  error: string | null

  // ── Bookmarks ───────────────────────────────────────────────────────────────
  bookmarks: string[]                  // file paths

  // ── Tag system ───────────────────────────────────────────────────────────────
  customTags: CustomTag[]              // all defined tags
  fileTags: Record<string, string[]>   // path → tag ids

  // ── Calendar / scheduled notes ───────────────────────────────────────────────
  noteSchedules: Record<string, string>   // path → ISO date string
  loadScheduledNotes: () => Promise<void>
  setNoteDate: (filePath: string, dateIso: string | null) => Promise<void>

  toggleBookmark: (path: string) => void

  addWorkspace: (path: string, name: string, tree: FolderNode[]) => void
  removeWorkspace: (index: number) => void
  setActiveWorkspace: (index: number) => void
  setTree: (tree: FolderNode[]) => void
  openFileNode: (node: FolderNode) => Promise<void>
  setActiveFileIndex: (index: number) => void
  closeTab: (index: number) => void
  closeAllTabs: () => void
  reorderOpenFiles: (fromIndex: number, toIndex: number) => void
  updateContent: (content: string) => void
  markSaved: () => void
  startEditing: () => void
  stopEditing: () => void
  togglePreview: () => void
  toggleSidebar: () => void
  setError: (msg: string | null) => void
  closeFile: () => void
  /** Update all references from oldPath to newPath (e.g. after move). */
  updateFilePathInWorkspace: (oldPath: string, newPath: string) => void

  addCustomTag: (name: string, color: string) => string
  updateCustomTag: (id: string, updates: Partial<Pick<CustomTag, 'name' | 'color'>>) => void
  deleteCustomTag: (id: string) => void
  toggleFileTag: (path: string, tagId: string) => void
  setFileTags: (path: string, tagIds: string[]) => void
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceIndex: 0,
      tree: [],
      openFiles: [],
      activeFileIndex: 0,
      isEditing: false,
      previewVisible: true,
      sidebarVisible: true,
      isLoading: false,
      error: null,
      bookmarks: [],
      customTags: [],
      fileTags: {},
      noteSchedules: {},

      loadScheduledNotes: async () => {
        const { workspaces, activeWorkspaceIndex } = get()
        const root = workspaces[activeWorkspaceIndex]?.path
        if (!root) return
        const res = await window.asterisk.getScheduledNotes(root)
        if (!res.ok || !res.data?.notes) return
        const map: Record<string, string> = {}
        for (const { path: p, scheduled } of res.data.notes) map[p] = scheduled
        set({ noteSchedules: map })
      },

      setNoteDate: async (filePath, dateIso) => {
        const res = await window.asterisk.readFile(filePath)
        if (!res.ok || res.data?.content === undefined) return
        const parsed = parseFrontmatter(res.data.content)
        const next = setScheduledFm(parsed, dateIso)
        const content = serializeFrontmatter(next.frontmatter, next.body)
        await window.asterisk.writeFile(filePath, content)
        set((s) => {
          const nextSchedules = { ...s.noteSchedules }
          if (dateIso) nextSchedules[filePath] = dateIso
          else delete nextSchedules[filePath]
          const nextFiles = s.openFiles.map((f) =>
            f.path === filePath ? { ...f, content, isDirty: false } : f
          )
          return { noteSchedules: nextSchedules, openFiles: nextFiles }
        })
      },

      toggleBookmark: (path) => set((s) => {
        const has = s.bookmarks.includes(path)
        const next = has ? s.bookmarks.filter((p) => p !== path) : [...s.bookmarks, path]
        return { bookmarks: next }
      }),

      addWorkspace: (path, name, tree) => {
        const { workspaces } = get()
        const existingIdx = workspaces.findIndex(w => w.path === path)
        if (existingIdx >= 0) {
          set({ activeWorkspaceIndex: existingIdx, tree, error: null })
        } else {
          const newWorkspaces = [...workspaces, { path, name }]
          set({ workspaces: newWorkspaces, activeWorkspaceIndex: newWorkspaces.length - 1, tree, error: null })
        }
      },

      removeWorkspace: (index) => set((state) => {
        const newWorkspaces = state.workspaces.filter((_, i) => i !== index)
        let nextIndex = state.activeWorkspaceIndex
        if (index === state.activeWorkspaceIndex) nextIndex = Math.max(0, index - 1)
        else if (index < state.activeWorkspaceIndex) nextIndex--
        return {
          workspaces: newWorkspaces,
          activeWorkspaceIndex: nextIndex,
          tree: index === state.activeWorkspaceIndex ? [] : state.tree,
          openFiles: index === state.activeWorkspaceIndex ? [] : state.openFiles,
          activeFileIndex: index === state.activeWorkspaceIndex ? 0 : state.activeFileIndex,
        }
      }),

      setActiveWorkspace: (index) => set({ activeWorkspaceIndex: index, tree: [], openFiles: [], activeFileIndex: 0, error: null }),
      setTree: (tree) => set({ tree }),

      openFileNode: async (node: FolderNode) => {
        if (node.kind !== 'file') return
        const { openFiles } = get()
        const existingIdx = openFiles.findIndex((f) => f.path === node.path)

        // Classify by file extension (case-insensitive)
        const extMatch = node.name.toLowerCase().match(/\.([a-z0-9]+)$/)
        const ext = extMatch ? extMatch[1] : ''
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif', 'avif']
        const binaryExts = [
          'pdf', 'docx', 'doc', 'odt', 'rtf',
          'xlsx', 'xls', 'ods',
          'pptx', 'ppt', 'odp',
          'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
          'db', 'sqlite', 'exe', 'dll', 'so', 'dylib'
        ]
        const isImage = imageExts.includes(ext)
        const isBinary = binaryExts.includes(ext)

        if (existingIdx >= 0) {
          set({ activeFileIndex: existingIdx, isEditing: !isImage && !isBinary })
          return
        }

        set({ isLoading: true, error: null })
        let newFile: EditorFile

        if (isImage) {
          newFile = {
            path: node.path,
            name: node.name,
            content: '',
            isDirty: false,
            fileType: 'image' as any
          }
        } else if (isBinary) {
          newFile = {
            path: node.path,
            name: node.name,
            content: '',
            isDirty: false,
            fileType: 'binary' as any
          }
        } else {
          const result = await window.asterisk.readFile(node.path)
          if (!result.ok || result.data === undefined) {
            set({ isLoading: false, error: result.error ?? 'Failed to read file' })
            return
          }
          newFile = {
            path: node.path,
            name: node.name,
            content: result.data.content,
            isDirty: false,
            fileType: 'text' as any
          }
        }

        const nextFiles = [...openFiles, newFile].slice(-MAX_OPEN_TABS)
        const nextIndex = nextFiles.length - 1
        set({
          openFiles: nextFiles,
          activeFileIndex: nextIndex,
          isLoading: false,
          isEditing: !isImage && !isBinary,
        })
      },

      setActiveFileIndex: (index) => set({ activeFileIndex: Math.max(0, Math.min(index, get().openFiles.length - 1)) }),

      closeTab: (index) => set((state) => {
        const nextFiles = state.openFiles.filter((_, i) => i !== index)
        let nextIndex = state.activeFileIndex
        if (index === state.activeFileIndex) {
          nextIndex = Math.max(0, Math.min(state.activeFileIndex, nextFiles.length - 1))
        } else if (index < state.activeFileIndex) {
          nextIndex = state.activeFileIndex - 1
        }
        return { openFiles: nextFiles, activeFileIndex: nextIndex }
      }),

      closeAllTabs: () => set({ openFiles: [], activeFileIndex: 0 }),

      reorderOpenFiles: (fromIndex, toIndex) => set((state) => {
        const { openFiles, activeFileIndex } = state
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= openFiles.length || toIndex >= openFiles.length) return state
        const next = [...openFiles]
        const [removed] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, removed)
        let nextActive = activeFileIndex
        if (activeFileIndex === fromIndex) nextActive = toIndex
        else if (fromIndex < activeFileIndex && toIndex >= activeFileIndex) nextActive = activeFileIndex - 1
        else if (fromIndex > activeFileIndex && toIndex <= activeFileIndex) nextActive = activeFileIndex + 1
        return { openFiles: next, activeFileIndex: nextActive }
      }),

      updateContent: (content) => {
        const { openFiles, activeFileIndex } = get()
        const file = openFiles[activeFileIndex]
        if (!file) return
        const next = [...openFiles]
        next[activeFileIndex] = { ...file, content, isDirty: true }
        set({ openFiles: next })
      },

      markSaved: () => {
        const { openFiles, activeFileIndex } = get()
        const file = openFiles[activeFileIndex]
        if (!file) return
        const next = [...openFiles]
        next[activeFileIndex] = { ...file, isDirty: false }
        set({ openFiles: next })
      },

      startEditing: () => set({ isEditing: true }),
      stopEditing: () => set({ isEditing: false }),

      togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      setError: (msg) => set({ error: msg }),
      closeFile: () => set((state) => {
        const idx = state.activeFileIndex
        const nextFiles = state.openFiles.filter((_, i) => i !== idx)
        const nextIndex = Math.max(0, Math.min(idx, nextFiles.length - 1))
        return { openFiles: nextFiles, activeFileIndex: nextIndex }
      }),

      // ── Tag actions ──────────────────────────────────────────────────────────
      addCustomTag: (name, color) => {
        const id = genId()
        const colorFinal = color || TAG_COLORS[get().customTags.length % TAG_COLORS.length]
        set((s) => ({ customTags: [...s.customTags, { id, name, color: colorFinal }] }))
        return id
      },

      updateCustomTag: (id, updates) => set((s) => ({
        customTags: s.customTags.map(t => t.id === id ? { ...t, ...updates } : t),
      })),

      deleteCustomTag: (id) => set((s) => {
        const newFileTags: Record<string, string[]> = {}
        for (const [path, ids] of Object.entries(s.fileTags)) {
          const filtered = ids.filter(i => i !== id)
          if (filtered.length > 0) newFileTags[path] = filtered
        }
        return { customTags: s.customTags.filter(t => t.id !== id), fileTags: newFileTags }
      }),

      toggleFileTag: (path, tagId) => set((s) => {
        const current = s.fileTags[path] ?? []
        const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
        const newFileTags = { ...s.fileTags }
        if (next.length > 0) newFileTags[path] = next
        else delete newFileTags[path]
        return { fileTags: newFileTags }
      }),

      setFileTags: (path, tagIds) => set((s) => {
        const newFileTags = { ...s.fileTags }
        if (tagIds.length > 0) newFileTags[path] = tagIds
        else delete newFileTags[path]
        return { fileTags: newFileTags }
      }),

      updateFilePathInWorkspace: (oldPath, newPath) => set((s) => {
        const newName = newPath.split(/[/\\]/).pop() ?? newPath
        const nextFiles = s.openFiles.map((f) =>
          f.path === oldPath ? { ...f, path: newPath, name: newName } : f
        )
        const nextFileTags = { ...s.fileTags }
        if (nextFileTags[oldPath] !== undefined) {
          nextFileTags[newPath] = nextFileTags[oldPath]
          delete nextFileTags[oldPath]
        }
        const nextBookmarks = s.bookmarks.map((p) => (p === oldPath ? newPath : p))
        const nextSchedules = { ...s.noteSchedules }
        if (nextSchedules[oldPath] !== undefined) {
          nextSchedules[newPath] = nextSchedules[oldPath]
          delete nextSchedules[oldPath]
        }
        return {
          openFiles: nextFiles,
          fileTags: nextFileTags,
          bookmarks: nextBookmarks,
          noteSchedules: nextSchedules,
        }
      }),
    }),
    {
      name: 'asterisk-workspace-v2',
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceIndex: state.activeWorkspaceIndex,
        openFiles: state.openFiles.map((f) => {
          const { dataUrl, ...rest } = f as typeof f & { dataUrl?: string }
          return rest
        }),
        activeFileIndex: state.activeFileIndex,
        isEditing: state.isEditing,
        previewVisible: state.previewVisible,
        sidebarVisible: state.sidebarVisible,
        bookmarks: state.bookmarks,
        customTags: state.customTags,
        fileTags: state.fileTags,
      }),
    }
  )
)

export { TAG_COLORS }

/** Get note paths scheduled for a given calendar day (local date). */
export function getNotesByDate(noteSchedules: Record<string, string>, date: Date): string[] {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const dayStr = `${y}-${m}-${d}`
  return Object.entries(noteSchedules)
    .filter(([, iso]) => iso.startsWith(dayStr))
    .map(([path]) => path)
}

/** Get upcoming scheduled notes sorted by date (from now). */
export function getUpcomingNotes(noteSchedules: Record<string, string>, limit = 20): { path: string; scheduled: string }[] {
  const now = new Date().toISOString()
  return Object.entries(noteSchedules)
    .filter(([, iso]) => iso >= now)
    .map(([path, scheduled]) => ({ path, scheduled }))
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled))
    .slice(0, limit)
}
