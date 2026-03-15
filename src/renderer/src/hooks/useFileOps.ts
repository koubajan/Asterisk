import { useWorkspace } from '../store/useWorkspace'

export function useFileOps() {
  const { 
    workspaces, activeWorkspaceIndex, 
    addWorkspace, setTree, openFileNode, setError, updateFilePathInWorkspace 
  } = useWorkspace()

  const activeWorkspace = workspaces[activeWorkspaceIndex]
  const folderPath = activeWorkspace?.path

  async function openFolder() {
    const result = await window.asterisk.openFolderDialog()
    if (!result.ok || !result.data) {
      if (result.error !== 'canceled') {
        setError(result.error ?? 'Failed to open folder')
      }
      return
    }
    const folderName = result.data.path.split(/[\\/]/).pop() ?? result.data.path
    addWorkspace(result.data.path, folderName, result.data.tree)
  }

  async function refreshTree() {
    if (!folderPath) return
    const result = await window.asterisk.listDir(folderPath)
    if (result.ok && result.data) {
      setTree(result.data.nodes)
    }
  }

  async function createFile(name: string, dirPath?: string) {
    const targetDir = dirPath ?? folderPath
    if (!targetDir) return
    const result = await window.asterisk.createFile(targetDir, name)
    if (!result.ok) {
      setError(result.error ?? 'Failed to create file')
      return
    }
    await refreshTree()
    if (result.data?.node) {
      await openFileNode(result.data.node)
    }
  }

  async function createFolder(name: string, dirPath?: string) {
    const targetDir = dirPath ?? folderPath
    if (!targetDir) return
    const result = await window.asterisk.createFolder(targetDir, name)
    if (!result.ok) {
      setError(result.error ?? 'Failed to create folder')
      return
    }
    await refreshTree()
  }

  async function deleteItem(itemPath: string) {
    const result = await window.asterisk.deleteItem(itemPath)
    if (!result.ok) {
      setError(result.error ?? 'Failed to delete item')
      return
    }
    await refreshTree()
  }

  async function renameItem(oldPath: string, newName: string): Promise<string | null> {
    const result = await window.asterisk.renameItem(oldPath, newName)
    if (!result.ok) {
      setError(result.error ?? 'Failed to rename item')
      return null
    }
    await refreshTree()
    return result.data?.newPath ?? null
  }

  async function moveItem(fromPath: string, toDirPath: string): Promise<string | null> {
    const result = await window.asterisk.moveItem(fromPath, toDirPath)
    if (!result.ok) {
      setError(result.error ?? 'Failed to move item')
      return null
    }
    const newPath = result.data?.newPath
    if (newPath) updateFilePathInWorkspace(fromPath, newPath)
    await refreshTree()
    return newPath ?? null
  }

  return { folderPath, openFolder, refreshTree, createFile, createFolder, deleteItem, renameItem, moveItem }
}
