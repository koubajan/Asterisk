import { contextBridge, ipcRenderer } from 'electron'
import type { AsteriskAPI, FolderNode } from './types'

const api: AsteriskAPI = {
  openFolderDialog: () => ipcRenderer.invoke('folder:open-dialog'),

  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),

  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:write-file', filePath, content),

  createFile: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-file', dirPath, name),

  createFolder: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-folder', dirPath, name),

  deleteItem: (itemPath: string) => ipcRenderer.invoke('fs:delete-item', itemPath),

  renameItem: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('fs:rename-item', oldPath, newName),

  listDir: (dirPath: string) => ipcRenderer.invoke('fs:list-dir', dirPath),

  searchContent: (folderPath: string, query: string) =>
    ipcRenderer.invoke('fs:search-content', folderPath, query),

  onFolderChange: (callback: (tree: FolderNode[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, tree: FolderNode[]) => callback(tree)
    ipcRenderer.on('folder:changed', listener)
    return () => ipcRenderer.removeListener('folder:changed', listener)
  }
}

contextBridge.exposeInMainWorld('asterisk', api)
