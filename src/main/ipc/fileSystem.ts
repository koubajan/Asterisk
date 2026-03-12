import * as fs from 'fs/promises'
import * as path from 'path'
import type { FolderNode } from '../../preload/types'

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.markdown'])

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
  const results: ContentMatch[] = []
  const q = query.trim().toLowerCase()
  for (const filePath of paths) {
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
