// ─── Folder / File Tree ──────────────────────────────────────────────────────

export type FolderNodeKind = 'file' | 'folder'

export interface FolderNode {
  kind: FolderNodeKind
  name: string      // basename, e.g. "Notes.md" or "Projects"
  path: string      // absolute path on disk
  children: FolderNode[]
  depth: number
  mtime?: number    // last-modified timestamp (ms since epoch)
}

// ─── Open Editor File ───────────────────────────────────────────────────────

export interface EditorFile {
  path: string
  name: string
  content: string
  isDirty: boolean
}

// ─── IPC Result Envelope ────────────────────────────────────────────────────

export interface IpcResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

// ─── IPC API (exposed via window.asteris) ───────────────────────────────────

export interface ContentSearchMatch {
  path: string
  snippets: string[]
}

export interface AsteriskAPI {
  openFolderDialog(): Promise<IpcResult<{ path: string; tree: FolderNode[] }>>
  readFile(filePath: string): Promise<IpcResult<{ content: string }>>
  writeFile(filePath: string, content: string): Promise<IpcResult>
  createFile(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  createFolder(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  deleteItem(itemPath: string): Promise<IpcResult>
  renameItem(oldPath: string, newName: string): Promise<IpcResult<{ newPath: string }>>
  listDir(dirPath: string): Promise<IpcResult<{ nodes: FolderNode[] }>>
  searchContent(folderPath: string, query: string): Promise<IpcResult<{ matches: ContentSearchMatch[] }>>
  onFolderChange(callback: (tree: FolderNode[]) => void): () => void
}

// ─── Window augmentation ────────────────────────────────────────────────────

declare global {
  interface Window {
    asterisk: AsteriskAPI
  }
}
