import { ipcMain, dialog, BrowserWindow, protocol, nativeImage, net, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { buildTree, safeReadFile, safeWriteFile, safeDeleteItem, searchContentInFolder, getScheduledNotesInFolder } from './fileSystem'
import { sendAIChat } from './ai'
import type { IpcResult, FolderNode } from '../../preload/types'

let sharp: typeof import('sharp') | null = null
try {
  sharp = require('sharp')
} catch {
  sharp = null
}

/** Detect image MIME from buffer magic bytes (avoids extension/PNG issues). */
function getImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    return 'image/webp'
  return null
}

function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  return fn()
    .then((data) => ({ ok: true, data } as IpcResult<T>))
    .catch((err: unknown) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }))
}

export function registerIpcHandlers(): void {
  // ── Open Folder Dialog ──────────────────────────────────────────────────────
  ipcMain.handle('folder:open-dialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Open Folder Folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'canceled' }
    }

    const folderPath = result.filePaths[0]
    return wrap(async () => ({
      path: folderPath,
      tree: await buildTree(folderPath)
    }))
  })

  // ── Read File ──────────────────────────────────────────────────────────────
  ipcMain.handle('fs:read-file', (_e, filePath: string) =>
    wrap(async () => {
      const p = String(filePath).trim()
      const normalized = p.includes('..') || p.includes('\\') ? path.normalize(p) : p
      return { content: await safeReadFile(normalized) }
    })
  )

  // ── Write File ─────────────────────────────────────────────────────────────
  ipcMain.handle('fs:write-file', (_e, filePath: string, content: string) =>
    wrap(() => safeWriteFile(filePath, content))
  )

  // ── Create File ────────────────────────────────────────────────────────────
  ipcMain.handle('fs:create-file', (_e, dirPath: string, name: string) =>
    wrap(async () => {
      const safeName = name.endsWith('.md') ? name : `${name}.md`
      const fullPath = path.join(dirPath, safeName)
      await fs.writeFile(fullPath, `# ${name.replace(/\.md$/, '')}\n\n`, 'utf-8')
      const node: FolderNode = {
        kind: 'file',
        name: path.basename(fullPath),
        path: fullPath,
        children: [],
        depth: 0
      }
      return { node }
    })
  )

  // ── Create Canvas (artifact) file ─────────────────────────────────────────
  // Creates in workspaceRoot/Artifacts/; ensures Artifacts folder exists.
  const ARTIFACTS_FOLDER_NAME = 'Artifacts'
  ipcMain.handle('fs:create-canvas', (_e, workspaceRootPath: string, name: string) =>
    wrap(async () => {
      const artifactsDir = path.join(workspaceRootPath, ARTIFACTS_FOLDER_NAME)
      await fs.mkdir(artifactsDir, { recursive: true })
      const safeName = name.endsWith('.artifact') ? name : `${name}.artifact`
      const fullPath = path.join(artifactsDir, safeName)
      const defaultContent = JSON.stringify(
        { version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        null,
        2
      )
      await fs.writeFile(fullPath, defaultContent, 'utf-8')
      const node: FolderNode = {
        kind: 'file',
        name: path.basename(fullPath),
        path: fullPath,
        children: [],
        depth: 0
      }
      return { node }
    })
  )

  // ── Create Excalidraw drawing ─────────────────────────────────────────────
  const EXCALIDRAW_FOLDER_NAME = 'Excalidraw'
  ipcMain.handle('fs:create-excalidraw', (_e, workspaceRootPath: string, name: string) =>
    wrap(async () => {
      const excalidrawDir = path.join(workspaceRootPath, EXCALIDRAW_FOLDER_NAME)
      await fs.mkdir(excalidrawDir, { recursive: true })
      const safeName = name.endsWith('.excalidraw') ? name : `${name}.excalidraw`
      const fullPath = path.join(excalidrawDir, safeName)
      const defaultContent = JSON.stringify(
        {
          type: 'excalidraw',
          version: 2,
          source: 'asterisk',
          elements: [],
          appState: { viewBackgroundColor: 'transparent' },
          files: {}
        },
        null,
        2
      )
      await fs.writeFile(fullPath, defaultContent, 'utf-8')
      const node: FolderNode = {
        kind: 'file',
        name: path.basename(fullPath),
        path: fullPath,
        children: [],
        depth: 0
      }
      return { node }
    })
  )

  // ── Create Folder ──────────────────────────────────────────────────────────
  ipcMain.handle('fs:create-folder', (_e, dirPath: string, name: string) =>
    wrap(async () => {
      const fullPath = path.join(dirPath, name)
      await fs.mkdir(fullPath, { recursive: true })
      const node: FolderNode = {
        kind: 'folder',
        name,
        path: fullPath,
        children: [],
        depth: 0
      }
      return { node }
    })
  )

  // ── Delete Item ────────────────────────────────────────────────────────────
  ipcMain.handle('fs:delete-item', (_e, itemPath: string) =>
    wrap(() => safeDeleteItem(itemPath))
  )

  // ── Rename Item ────────────────────────────────────────────────────────────
  ipcMain.handle('fs:rename-item', (_e, oldPath: string, newName: string) =>
    wrap(async () => {
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      await fs.rename(oldPath, newPath)
      return { newPath }
    })
  )

  // ── Move Item (into another folder, for tree drag-drop) ────────────────────
  ipcMain.handle('fs:move-item', (_e, fromPath: string, toDirPath: string) =>
    wrap(async () => {
      const name = path.basename(fromPath)
      const newPath = path.join(toDirPath, name)
      if (fromPath === newPath) return { newPath: fromPath }
      await fs.rename(fromPath, newPath)
      return { newPath }
    })
  )

  // ── List Directory ─────────────────────────────────────────────────────────
  ipcMain.handle('fs:list-dir', (_e, dirPath: string) =>
    wrap(async () => ({ nodes: await buildTree(dirPath) }))
  )

  // ── Search file content ───────────────────────────────────────────────────
  ipcMain.handle('fs:search-content', (_e, folderPath: string, query: string) =>
    wrap(async () => ({ matches: await searchContentInFolder(folderPath, query) }))
  )

  // ── Get scheduled notes (frontmatter scheduled: field) ─────────────────────
  ipcMain.handle('fs:get-scheduled-notes', (_e, folderPath: string) =>
    wrap(async () => ({ notes: await getScheduledNotesInFolder(folderPath) }))
  )

  // ── AI Chat ─────────────────────────────────────────────────────────────────
  ipcMain.handle('ai:chat', (_e, req: { provider: string; apiKey: string; messages: { role: string; content: string }[]; fileContext?: string }) =>
    wrap(() => sendAIChat(req as Parameters<typeof sendAIChat>[0]).then((content) => ({ content })))
  )

  // ── Open URL in system browser (for embed-blocked sites) ───────────────────────
  ipcMain.handle('open-external-url', (_e, url: string) =>
    wrap(async () => {
      const u = String(url ?? '').trim()
      if (u && (u.startsWith('http://') || u.startsWith('https://'))) shell.openExternal(u)
    })
  )

  // ── Fetch URL text (main process, no CORS) for link preview ───────────────────
  ipcMain.handle('fetch-url-text', (_e, url: string) =>
    wrap(async () => {
      const u = String(url ?? '').trim()
      if (!u || (!u.startsWith('http://') && !u.startsWith('https://'))) throw new Error('Invalid URL')
      const res = await net.fetch(u, { method: 'GET' })
      const text = await res.text()
      return { text: text.slice(0, 256 * 1024) }
    })
  )

  // ── Fetch image URL as data URL (main process, no CORS) for link card preview ─
  const SAFE_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB cap for preview images
  ipcMain.handle('fetch-image-data-url', (_e, imageUrl: string) =>
    wrap(async () => {
      const u = String(imageUrl ?? '').trim()
      if (!u || (!u.startsWith('http://') && !u.startsWith('https://'))) throw new Error('Invalid URL')
      const res = await net.fetch(u, { method: 'GET' })
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > SAFE_IMAGE_BYTES) throw new Error('Image too large')
      const ct = res.headers.get('content-type') || ''
      const mime = ct.split(';')[0].trim() || 'image/jpeg'
      const base64 = buf.toString('base64')
      return { dataUrl: `data:${mime};base64,${base64}` }
    })
  )

  // ── Save image (e.g. canvas export) with save dialog ─────────────────────────
  ipcMain.handle('fs:save-image', async (_e, dataUrl: string, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No window' }

    const result = await dialog.showSaveDialog(win, {
      title: 'Export Artifact as Image',
      defaultPath: defaultName || 'artifact.png',
      filters: [
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { ok: false, error: 'canceled' }
    }

    return wrap(async () => {
      const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
      if (!base64Match) throw new Error('Invalid data URL')
      const buffer = Buffer.from(base64Match[1], 'base64')
      await fs.writeFile(result.filePath!, buffer)
      return { path: result.filePath! }
    })
  })

  // ── Read image as data URL: use sharp when available (resize); else raw under cap ─────────
  const SAFE_RAW_BYTES = 550_000 // ~730k base64; over ~1MB can truncate over IPC
  ipcMain.handle('fs:read-image-data-url', (_e, filePath: string) =>
    wrap(async () => {
      const normalized = normalizeImagePath(filePath)
      if (!existsSync(normalized)) {
        throw new Error('File not found')
      }
      const raw = await fs.readFile(normalized)
      const ext = path.extname(normalized).toLowerCase()

      let buf: Buffer
      let mime: string

      if (ext === '.svg') {
        if (raw.length > 200_000) throw new Error('SVG too large')
        mime = 'image/svg+xml'
        buf = raw
      } else if (sharp) {
        try {
          buf = await sharp(raw)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer()
          mime = 'image/jpeg'
        } catch {
          if (raw.length > SAFE_RAW_BYTES) throw new Error('Image too large')
          buf = raw
          mime = getImageMimeFromBuffer(raw) ?? getMimeFromExt(normalized)
        }
      } else {
        if (raw.length > SAFE_RAW_BYTES) throw new Error('Image too large')
        buf = raw
        mime = getImageMimeFromBuffer(raw) ?? getMimeFromExt(normalized)
      }

      const base64 = buf.toString('base64')
      return { dataUrl: `data:${mime};base64,${base64}` }
    })
  )
}

function normalizeImagePath(filePath: string): string {
  let s = String(filePath).trim().replace(/^file:\/\/+/i, '').replace(/\\/g, '/')
  try {
    if (s.includes('%')) s = decodeURIComponent(s)
  } catch { /* leave as-is */ }
  if (path.isAbsolute(s) || /^[A-Za-z]:[/\\]/.test(s)) return path.normalize(s)
  return path.normalize(path.resolve(process.cwd(), s))
}

function getMimeFromExt(normalizedPath: string): string {
  const ext = path.extname(normalizedPath).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  return ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg'
}

/** Register asterisk-file:// so <img src="asterisk-file://local/path"> loads from disk. */
export function registerImageProtocol(): void {
  const handler = (request: Request) => {
    try {
      const url = new URL(request.url)
      let pathStr = decodeURIComponent(url.pathname)
      if (!pathStr || pathStr === '/') return new Response('Not Found', { status: 404 })
      if (process.platform !== 'win32' && !pathStr.startsWith('/')) pathStr = '/' + pathStr
      if (process.platform === 'win32' && /^\/[A-Za-z]:/i.test(pathStr)) {
        pathStr = pathStr.slice(1).replace(/\//g, path.sep)
      }
      const normalized = path.normalize(pathStr)
      const buf = readFileSync(normalized)
      const mime = getImageMimeFromBuffer(buf) ?? getMimeFromExt(normalized)
      return new Response(buf, { headers: { 'Content-Type': mime } })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  }
  protocol.handle('asterisk-file', handler)
}
