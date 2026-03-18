import { useEffect } from 'react'
import { useWorkspace } from '../store/useWorkspace'
import { useSettings } from '../store/useSettings'
import { useArtifacts, getCanvasContentForSave } from '../store/useArtifacts'

export function useAutoSave(): void {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const markSaved = useWorkspace((s) => s.markSaved)
  const updateContent = useWorkspace((s) => s.updateContent)
  const autoSave = useSettings((s) => s.autoSave)
  const isCanvas = openFile?.path.endsWith('.artifact') ?? false
  const isExcalidraw = openFile?.path.endsWith('.excalidraw') ?? false
  const artifactsDirty = useArtifacts((s) => s.isDirty)
  const artifactsMarkSaved = useArtifacts((s) => s.markSaved)

  const fileDirty = isCanvas ? artifactsDirty : (openFile?.isDirty ?? false)

  useEffect(() => {
    // Excalidraw handles its own save via debounced onChange
    if (!autoSave || !openFile || !fileDirty || isExcalidraw) return

    const timer = setTimeout(async () => {
      const contentToSave = isCanvas ? getCanvasContentForSave() : openFile.content
      if (isCanvas && !contentToSave) return
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
  }, [autoSave, openFile?.path, fileDirty, isCanvas, isExcalidraw, openFile?.content, markSaved, updateContent, artifactsMarkSaved])
}
