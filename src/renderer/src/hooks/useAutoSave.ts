import { useEffect } from 'react'
import { useWorkspace } from '../store/useWorkspace'
import { useSettings } from '../store/useSettings'

export function useAutoSave(): void {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const markSaved = useWorkspace((s) => s.markSaved)
  const autoSave = useSettings((s) => s.autoSave)

  useEffect(() => {
    if (!autoSave || !openFile?.isDirty) return

    const timer = setTimeout(async () => {
      const result = await window.asterisk.writeFile(openFile.path, openFile.content)
      if (result.ok) {
        markSaved()
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [autoSave, openFile?.content, openFile?.isDirty, openFile?.path, markSaved])
}
