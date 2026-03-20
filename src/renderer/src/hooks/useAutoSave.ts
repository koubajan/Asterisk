import { useEffect, useRef } from 'react'
import { useWorkspace } from '../store/useWorkspace'
import { useSettings } from '../store/useSettings'
import { useArtifacts, getCanvasContentForSave } from '../store/useArtifacts'

export function useAutoSave(): void {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const autoSave = useSettings((s) => s.autoSave)
  const snapshotOnAutoSave = useSettings((s) => s.snapshotOnAutoSave)
  const isCanvas = openFile?.path.endsWith('.artifact') ?? false
  const isExcalidraw = openFile?.path.endsWith('.excalidraw') ?? false
  const artifactsDirty = useArtifacts((s) => s.isDirty)

  const workspacePath = workspaces[activeWorkspaceIndex]?.path ?? null
  const lastSnapshotRef = useRef<{ path: string; time: number } | null>(null)

  const fileDirty = isCanvas ? artifactsDirty : (openFile?.isDirty ?? false)

  useEffect(() => {
    // Excalidraw handles its own save via debounced onChange
    if (!autoSave || !openFile || !fileDirty || isExcalidraw) return

    const timer = setTimeout(async () => {
      // Read latest state when the debounce fires — stale closures caused wrong/empty writes
      // (e.g. toggling auto-save on, or typing after a save race).
      const settings = useSettings.getState()
      if (!settings.autoSave) return

      const ws = useWorkspace.getState()
      const file = ws.openFiles[ws.activeFileIndex]
      if (!file) return

      const path = file.path
      const canvasNow = path.endsWith('.artifact')
      const excalidrawNow = path.endsWith('.excalidraw')
      if (excalidrawNow) return

      const artifactsState = useArtifacts.getState()
      const stillDirty = canvasNow ? artifactsState.isDirty : file.isDirty
      if (!stillDirty) return

      const contentToSave = canvasNow ? getCanvasContentForSave() : file.content
      if (canvasNow && !contentToSave) return

      const workspacePathNow = ws.workspaces[ws.activeWorkspaceIndex]?.path ?? null

      if (settings.snapshotOnAutoSave && workspacePathNow && !canvasNow && !excalidrawNow) {
        const now = Date.now()
        const last = lastSnapshotRef.current
        const shouldSnapshot = !last || last.path !== file.path || now - last.time > 30000

        if (shouldSnapshot) {
          try {
            await window.asterisk.saveSnapshot(workspacePathNow, file.path, file.content)
            lastSnapshotRef.current = { path: file.path, time: now }
          } catch {
            // Snapshot failed, continue with save anyway
          }
        }
      }

      const result = await window.asterisk.writeFile(path, contentToSave ?? file.content)
      if (!result.ok) return

      const wsAfter = useWorkspace.getState()
      const active = wsAfter.openFiles[wsAfter.activeFileIndex]
      if (!active || active.path !== path) return

      if (canvasNow && contentToSave) {
        wsAfter.updateContent(contentToSave)
        useArtifacts.getState().markSaved()
      }
      wsAfter.markSaved()
    }, 800)

    return () => clearTimeout(timer)
  }, [
    autoSave,
    snapshotOnAutoSave,
    workspacePath,
    openFile?.path,
    fileDirty,
    isCanvas,
    isExcalidraw,
    openFile?.content,
    artifactsDirty
  ])
}
