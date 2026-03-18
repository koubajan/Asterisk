import * as fs from 'fs/promises'
import * as path from 'path'
import { existsSync } from 'fs'
import type { FolderNode } from '../../preload/types'

// ─── Version History ────────────────────────────────────────────────────────

const HISTORY_FOLDER = '.history'
const MAX_SNAPSHOTS_PER_FILE = 50

export interface FileSnapshot {
  id: string
  filePath: string
  timestamp: number
  content: string
  size: number
}

function getHistoryDir(workspacePath: string): string {
  return path.join(workspacePath, HISTORY_FOLDER)
}

function getFileHistoryPath(workspacePath: string, filePath: string): string {
  const relativePath = path.relative(workspacePath, filePath)
  const safeName = relativePath.replace(/[/\\]/g, '__').replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(getHistoryDir(workspacePath), `${safeName}.json`)
}

export async function saveFileSnapshot(
  workspacePath: string,
  filePath: string,
  content: string
): Promise<FileSnapshot> {
  const historyDir = getHistoryDir(workspacePath)
  await fs.mkdir(historyDir, { recursive: true })
  
  const historyFilePath = getFileHistoryPath(workspacePath, filePath)
  let snapshots: FileSnapshot[] = []
  
  try {
    const existing = await fs.readFile(historyFilePath, 'utf-8')
    snapshots = JSON.parse(existing)
  } catch {
    // No existing history
  }
  
  const snapshot: FileSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filePath,
    timestamp: Date.now(),
    content,
    size: content.length
  }
  
  snapshots.push(snapshot)
  
  // Keep only the last N snapshots
  if (snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS_PER_FILE)
  }
  
  await fs.writeFile(historyFilePath, JSON.stringify(snapshots, null, 2), 'utf-8')
  
  return snapshot
}

export async function getFileSnapshots(
  workspacePath: string,
  filePath: string
): Promise<Omit<FileSnapshot, 'content'>[]> {
  const historyFilePath = getFileHistoryPath(workspacePath, filePath)
  
  try {
    const data = await fs.readFile(historyFilePath, 'utf-8')
    const snapshots: FileSnapshot[] = JSON.parse(data)
    // Return without content to keep response small
    return snapshots.map(({ id, filePath, timestamp, size }) => ({
      id,
      filePath,
      timestamp,
      size
    })).reverse() // Most recent first
  } catch {
    return []
  }
}

export async function getSnapshotContent(
  workspacePath: string,
  filePath: string,
  snapshotId: string
): Promise<string | null> {
  const historyFilePath = getFileHistoryPath(workspacePath, filePath)
  
  try {
    const data = await fs.readFile(historyFilePath, 'utf-8')
    const snapshots: FileSnapshot[] = JSON.parse(data)
    const snapshot = snapshots.find(s => s.id === snapshotId)
    return snapshot?.content ?? null
  } catch {
    return null
  }
}

export async function deleteSnapshot(
  workspacePath: string,
  filePath: string,
  snapshotId: string
): Promise<void> {
  const historyFilePath = getFileHistoryPath(workspacePath, filePath)
  
  try {
    const data = await fs.readFile(historyFilePath, 'utf-8')
    let snapshots: FileSnapshot[] = JSON.parse(data)
    snapshots = snapshots.filter(s => s.id !== snapshotId)
    await fs.writeFile(historyFilePath, JSON.stringify(snapshots, null, 2), 'utf-8')
  } catch {
    // No history to delete from
  }
}

const ALLOWED_EXTENSIONS = new Set([
  // Markdown/text
  '.md', '.txt', '.markdown',
  // Artifact
  '.artifact',
  // Excalidraw
  '.excalidraw',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
  // Documents
  '.pdf', '.docx', '.doc', '.odt', '.rtf',
  // Spreadsheets
  '.xlsx', '.xls', '.csv', '.ods',
  // Presentations
  '.pptx', '.ppt', '.odp',
  // Code files
  '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.sh', '.bash', '.zsh',
  // Data
  '.sql', '.db', '.sqlite',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  // Other
  '.log', '.mdx'
])

export async function buildTree(dirPath: string, depth = 0): Promise<FolderNode[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FolderNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, depth + 1)
      let mtime: number | undefined
      try { mtime = (await fs.stat(fullPath)).mtimeMs } catch { /* skip */ }
      nodes.push({ kind: 'folder', name: entry.name, path: fullPath, children, depth, mtime })
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (ALLOWED_EXTENSIONS.has(ext)) {
        let mtime: number | undefined
        try { mtime = (await fs.stat(fullPath)).mtimeMs } catch { /* skip */ }
        nodes.push({ kind: 'file', name: entry.name, path: fullPath, children: [], depth, mtime })
      }
    }
  }

  // Folders first, then files; both alphabetical
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function safeReadFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function safeWriteFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function safeDeleteItem(itemPath: string): Promise<void> {
  const stat = await fs.stat(itemPath)
  if (stat.isDirectory()) {
    await fs.rm(itemPath, { recursive: true, force: true })
  } else {
    await fs.unlink(itemPath)
  }
}

const MAX_FILE_SIZE = 512 * 1024 // 512KB per file
const MAX_SNIPPETS_PER_FILE = 3
const SNIPPET_CONTEXT = 40

export interface ContentMatch {
  path: string
  snippets: string[]
}

function collectFilePaths(nodes: FolderNode[], out: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'file') out.push(node.path)
    else collectFilePaths(node.children, out)
  }
}

function extractSnippets(content: string, query: string, maxSnippets: number): string[] {
  const q = query.toLowerCase()
  const snippets: string[] = []
  let pos = 0
  while (snippets.length < maxSnippets) {
    const i = content.toLowerCase().indexOf(q, pos)
    if (i < 0) break
    const start = Math.max(0, i - SNIPPET_CONTEXT)
    const end = Math.min(content.length, i + query.length + SNIPPET_CONTEXT)
    let snippet = content.slice(start, end).replace(/\n/g, ' ')
    if (snippet.length > 100) snippet = (start > 0 ? '…' : '') + snippet.slice(0, 97) + '…'
    snippets.push(snippet.trim())
    pos = i + 1
  }
  return snippets
}

export async function searchContentInFolder(
  folderPath: string,
  query: string
): Promise<ContentMatch[]> {
  if (!query.trim()) return []
  const tree = await buildTree(folderPath)
  const paths: string[] = []
  collectFilePaths(tree, paths)
  const searchPaths = paths.filter((p) => /\.(md|markdown)$/i.test(p))
  const results: ContentMatch[] = []
  const q = query.trim().toLowerCase()
  for (const filePath of searchPaths) {
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_FILE_SIZE) continue
      const content = await fs.readFile(filePath, 'utf-8')
      const snippets = extractSnippets(content, q, MAX_SNIPPETS_PER_FILE)
      if (snippets.length > 0) results.push({ path: filePath, snippets })
    } catch {
      // skip unreadable files
    }
  }
  return results
}

const FRONTMATTER_HEAD = /^\s*---\s*\n/
const SCHEDULED_RE = /^\s*scheduled:\s*["']?([^"'\s\n]+(?:T[^"'\s\n]*)?)["']?\s*$/m
const REMINDER_RE = /^\s*reminder:\s*["']?(.+?)["']?\s*$/m

export interface ScheduledNote {
  path: string
  scheduled: string
  reminder?: string
}

function extractFromFrontmatter(content: string): { scheduled: string | null; reminder: string | null } {
  const head = content.match(FRONTMATTER_HEAD)
  if (!head) return { scheduled: null, reminder: null }
  const start = head.index! + head[0].length
  const end = content.indexOf('\n---', start)
  const block = end >= 0 ? content.slice(start, end) : content.slice(start, start + 1500)
  const scheduledMatch = block.match(SCHEDULED_RE)
  const reminderMatch = block.match(REMINDER_RE)
  return {
    scheduled: scheduledMatch ? scheduledMatch[1].trim() : null,
    reminder: reminderMatch ? reminderMatch[1].trim() : null
  }
}

export async function getScheduledNotesInFolder(folderPath: string): Promise<ScheduledNote[]> {
  const tree = await buildTree(folderPath)
  const paths: string[] = []
  collectFilePaths(tree, paths)
  const mdPaths = paths.filter((p) => /\.(md|markdown)$/i.test(p))
  const results: ScheduledNote[] = []
  for (const filePath of mdPaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const { scheduled, reminder } = extractFromFrontmatter(content.slice(0, 2048))
      if (scheduled) {
        const note: ScheduledNote = { path: filePath, scheduled }
        if (reminder) note.reminder = reminder
        results.push(note)
      }
    } catch {
      // skip
    }
  }
  return results
}
