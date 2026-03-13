import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { buildTree, safeReadFile, safeWriteFile, safeDeleteItem, searchContentInFolder } from './fileSystem'
import type { IpcResult, FolderNode } from '../../preload/types'

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
    wrap(async () => ({
      content: await safeReadFile(filePath)
    }))
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
  ipcMain.handle('fs:create-canvas', (_e, dirPath: string, name: string) =>
    wrap(async () => {
      const safeName = name.endsWith('.artifact') ? name : `${name}.artifact`
      const fullPath = path.join(dirPath, safeName)
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

  // ── Read image as data URL (for canvas image nodes) ─────────────────────────
  ipcMain.handle('fs:read-image-data-url', (_e, filePath: string) =>
    wrap(async () => {
      const normalized = path.normalize(String(filePath).replace(/^file:\/\/+/, ''))
      const buf = await fs.readFile(normalized)
      const mime =
        getImageMimeFromBuffer(buf) ??
        (() => {
          const ext = path.extname(normalized).toLowerCase()
          return ext === '.png'
            ? 'image/png'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.svg'
                  ? 'image/svg+xml'
                  : 'image/jpeg'
        })()
      const base64 = buf.toString('base64')
      return { dataUrl: `data:${mime};base64,${base64}` }
    })
  )
}
