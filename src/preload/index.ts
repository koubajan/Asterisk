import { contextBridge, ipcRenderer } from 'electron'
import type { AsteriskAPI, FolderNode } from './types'

const api: AsteriskAPI = {
  openFolderDialog: () => ipcRenderer.invoke('folder:open-dialog'),

  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),

  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:write-file', filePath, content),

  createFile: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-file', dirPath, name),

  createCanvas: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-canvas', dirPath, name),

  createExcalidraw: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-excalidraw', dirPath, name),

  createFolder: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-folder', dirPath, name),

  deleteItem: (itemPath: string) => ipcRenderer.invoke('fs:delete-item', itemPath),

  renameItem: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('fs:rename-item', oldPath, newName),

  moveItem: (fromPath: string, toDirPath: string) =>
    ipcRenderer.invoke('fs:move-item', fromPath, toDirPath),

  listDir: (dirPath: string) => ipcRenderer.invoke('fs:list-dir', dirPath),

  searchContent: (folderPath: string, query: string) =>
    ipcRenderer.invoke('fs:search-content', folderPath, query),

  getScheduledNotes: (folderPath: string) =>
    ipcRenderer.invoke('fs:get-scheduled-notes', folderPath),

  aiChat: (req: import('./types').AIChatRequest) =>
    ipcRenderer.invoke('ai:chat', req),

  readImageAsDataUrl: (filePath: string) =>
    ipcRenderer.invoke('fs:read-image-data-url', filePath),

  saveImage: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('fs:save-image', dataUrl, defaultName),

  fetchUrlText: (url: string) =>
    ipcRenderer.invoke('fetch-url-text', url),

  fetchImageDataUrl: (imageUrl: string) =>
    ipcRenderer.invoke('fetch-image-data-url', imageUrl),

  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('open-external-url', url),

  onFolderChange: (callback: (tree: FolderNode[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, tree: FolderNode[]) => callback(tree)
    ipcRenderer.on('folder:changed', listener)
    return () => ipcRenderer.removeListener('folder:changed', listener)
  }
}

contextBridge.exposeInMainWorld('asterisk', api)
