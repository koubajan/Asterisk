import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { buildTree, safeReadFile, safeWriteFile, safeDeleteItem, searchContentInFolder } from './fileSystem'
import type { IpcResult, FolderNode } from '../../preload/types'

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

  // ── List Directory ─────────────────────────────────────────────────────────
  ipcMain.handle('fs:list-dir', (_e, dirPath: string) =>
    wrap(async () => ({ nodes: await buildTree(dirPath) }))
  )

  // ── Search file content ───────────────────────────────────────────────────
  ipcMain.handle('fs:search-content', (_e, folderPath: string, query: string) =>
    wrap(async () => ({ matches: await searchContentInFolder(folderPath, query) }))
  )
}
