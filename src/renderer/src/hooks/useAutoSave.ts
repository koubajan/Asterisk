import { useEffect, useRef } from 'react'
import { useWorkspace } from '../store/useWorkspace'
import { useSettings } from '../store/useSettings'
import { useArtifacts, getCanvasContentForSave } from '../store/useArtifacts'

export function useAutoSave(): void {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const markSaved = useWorkspace((s) => s.markSaved)
  const updateContent = useWorkspace((s) => s.updateContent)
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const autoSave = useSettings((s) => s.autoSave)
  const snapshotOnAutoSave = useSettings((s) => s.snapshotOnAutoSave)
  const isCanvas = openFile?.path.endsWith('.artifact') ?? false
  const isExcalidraw = openFile?.path.endsWith('.excalidraw') ?? false
  const artifactsDirty = useArtifacts((s) => s.isDirty)
  const artifactsMarkSaved = useArtifacts((s) => s.markSaved)
  
  const workspacePath = workspaces[activeWorkspaceIndex]?.path ?? null
  const lastSnapshotRef = useRef<{ path: string; time: number } | null>(null)

  const fileDirty = isCanvas ? artifactsDirty : (openFile?.isDirty ?? false)

  useEffect(() => {
    // Excalidraw handles its own save via debounced onChange
    if (!autoSave || !openFile || !fileDirty || isExcalidraw) return

    const timer = setTimeout(async () => {
      const contentToSave = isCanvas ? getCanvasContentForSave() : openFile.content
      if (isCanvas && !contentToSave) return
      
      // Create snapshot before saving (for text files only, throttled to max once per 30 seconds)
      if (snapshotOnAutoSave && workspacePath && !isCanvas && !isExcalidraw) {
        const now = Date.now()
        const last = lastSnapshotRef.current
        const shouldSnapshot = !last || last.path !== openFile.path || (now - last.time) > 30000
        
        if (shouldSnapshot) {
          try {
            await window.asterisk.saveSnapshot(workspacePath, openFile.path, openFile.content)
            lastSnapshotRef.current = { path: openFile.path, time: now }
          } catch {
            // Snapshot failed, continue with save anyway
          }
        }
      }
      
      const result = await window.asterisk.writeFile(openFile.path, contentToSave ?? openFile.content)
      if (result.ok) {
        if (isCanvas && contentToSave) {
          updateContent(contentToSave)
          artifactsMarkSaved()
        }
        markSaved()
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [autoSave, snapshotOnAutoSave, workspacePath, openFile?.path, fileDirty, isCanvas, isExcalidraw, openFile?.content, markSaved, updateContent, artifactsMarkSaved])
}
