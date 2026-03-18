import { useEffect, useRef, useCallback, useMemo } from 'react'
import { Excalidraw, THEME } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useSettings, PRESET_THEMES } from '../../store/useSettings'
import { useWorkspace } from '../../store/useWorkspace'
import './ExcalidrawPane.css'

interface ExcalidrawPaneProps {
  filePath: string
  initialContent: string
}

function parseExcalidrawData(json: string) {
  try {
    const parsed = JSON.parse(json)
    return {
      elements: parsed.elements || [],
      appState: {
        ...(parsed.appState || {}),
        collaborators: new Map(),
      },
      files: parsed.files || {},
    }
  } catch {
    return { elements: [], appState: { collaborators: new Map() }, files: {} }
  }
}

export default function ExcalidrawPane({ filePath, initialContent }: ExcalidrawPaneProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstChangeRef = useRef(true)
  const pendingDataRef = useRef<{ path: string; data: string } | null>(null)
  
  const updateOpenFileContent = useCallback((path: string, content: string) => {
    useWorkspace.setState((s) => ({
      openFiles: s.openFiles.map((f) => 
        f.path === path ? { ...f, content, isDirty: false } : f
      )
    }))
  }, [])

  const { activeThemeId, customThemes } = useSettings()
  const allThemes = [...PRESET_THEMES, ...customThemes]
  const activeTheme = allThemes.find((t) => t.id === activeThemeId) || PRESET_THEMES[0]
  const isDark = activeTheme.colors.bgBase === '#000000' || activeTheme.colors.bgBase < '#333333'

  // Parse once per file; stable across re-renders for the same filePath
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialData = useMemo(() => parseExcalidrawData(initialContent), [filePath])

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      // Skip the initial onChange Excalidraw fires on mount
      if (isFirstChangeRef.current) {
        isFirstChangeRef.current = false
        return
      }
      
      const data = JSON.stringify(
        {
          type: 'excalidraw',
          version: 2,
          source: 'asterisk',
          elements: elements.filter((el: any) => !el.isDeleted),
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize ?? null,
          },
          files: files || {},
        },
        null,
        2
      )
      
      pendingDataRef.current = { path: filePath, data }
      
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        if (pendingDataRef.current) {
          const { path, data } = pendingDataRef.current
          const result = await window.asterisk.writeFile(path, data)
          if (result.ok) {
            updateOpenFileContent(path, data)
          }
          pendingDataRef.current = null
        }
      }, 500)
    },
    [filePath, updateOpenFileContent]
  )

  // Save pending changes immediately when switching files or unmounting
  useEffect(() => {
    // Save any pending data for the PREVIOUS file before resetting
    if (pendingDataRef.current && pendingDataRef.current.path !== filePath) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const { path, data } = pendingDataRef.current
      window.asterisk.writeFile(path, data).then((result) => {
        if (result.ok) {
          updateOpenFileContent(path, data)
        }
      })
      pendingDataRef.current = null
    }
    
    isFirstChangeRef.current = true
    
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      // Save any pending changes immediately when unmounting
      if (pendingDataRef.current) {
        const { path, data } = pendingDataRef.current
        window.asterisk.writeFile(path, data).then((result) => {
          if (result.ok) {
            updateOpenFileContent(path, data)
          }
        })
        pendingDataRef.current = null
      }
    }
  }, [filePath, updateOpenFileContent])

  return (
    <div className="excalidraw-pane">
      <div className="excalidraw-wrapper">
        <Excalidraw
          key={filePath}
          initialData={initialData}
          onChange={handleChange}
          theme={isDark ? THEME.DARK : THEME.LIGHT}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: false,
            },
          }}
        />
      </div>
    </div>
  )
}
