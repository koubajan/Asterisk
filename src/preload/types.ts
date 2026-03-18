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

export type FileType = 'text' | 'image' | 'binary'

export interface EditorFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  fileType?: FileType
  dataUrl?: string
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

export interface ScheduledNote {
  path: string
  scheduled: string
  reminder?: string
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIChatRequest {
  provider: 'openai' | 'anthropic' | 'gemini'
  apiKey: string
  model?: string
  messages: AIMessage[]
  fileContext?: string
}

export interface ReminderConfig {
  enabled: boolean
  advanceMinutes: number
  workspacePath: string | null
}

export interface FileSnapshot {
  id: string
  filePath: string
  timestamp: number
  size: number
}

export interface FileSnapshotWithContent extends FileSnapshot {
  content: string
}

export interface AsteriskAPI {
  openFolderDialog(): Promise<IpcResult<{ path: string; tree: FolderNode[] }>>
  readFile(filePath: string): Promise<IpcResult<{ content: string }>>
  writeFile(filePath: string, content: string): Promise<IpcResult>
  createFile(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  createCanvas(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  createExcalidraw(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  createFolder(dirPath: string, name: string): Promise<IpcResult<{ node: FolderNode }>>
  deleteItem(itemPath: string): Promise<IpcResult>
  renameItem(oldPath: string, newName: string): Promise<IpcResult<{ newPath: string }>>
  moveItem(fromPath: string, toDirPath: string): Promise<IpcResult<{ newPath: string }>>
  listDir(dirPath: string): Promise<IpcResult<{ nodes: FolderNode[] }>>
  searchContent(folderPath: string, query: string): Promise<IpcResult<{ matches: ContentSearchMatch[] }>>
  getScheduledNotes(folderPath: string): Promise<IpcResult<{ notes: ScheduledNote[] }>>
  aiChat(req: AIChatRequest): Promise<IpcResult<{ content: string }>>
  readImageAsDataUrl(filePath: string): Promise<IpcResult<{ dataUrl: string }>>
  saveImage(dataUrl: string, defaultName: string): Promise<IpcResult<{ path: string }>>
  fetchUrlText(url: string): Promise<IpcResult<{ text: string }>>
  fetchImageDataUrl(imageUrl: string): Promise<IpcResult<{ dataUrl: string }>>
  openExternalUrl(url: string): Promise<IpcResult>
  setReminderConfig(config: Partial<ReminderConfig>): Promise<IpcResult>
  getReminderConfig(): Promise<IpcResult<ReminderConfig>>
  onFolderChange(callback: (tree: FolderNode[]) => void): () => void
  onReminderOpenNote(callback: (notePath: string) => void): () => void
  
  // Version History
  saveSnapshot(workspacePath: string, filePath: string, content: string): Promise<IpcResult<FileSnapshotWithContent>>
  getSnapshots(workspacePath: string, filePath: string): Promise<IpcResult<FileSnapshot[]>>
  getSnapshotContent(workspacePath: string, filePath: string, snapshotId: string): Promise<IpcResult<{ content: string }>>
  deleteSnapshot(workspacePath: string, filePath: string, snapshotId: string): Promise<IpcResult>
}

// ─── Window augmentation ────────────────────────────────────────────────────

declare global {
  interface Window {
    asterisk: AsteriskAPI
  }
}
