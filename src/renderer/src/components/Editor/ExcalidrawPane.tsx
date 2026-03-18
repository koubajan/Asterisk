import { useEffect, useRef, useCallback, useMemo } from 'react'
import { Excalidraw, THEME } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useSettings, PRESET_THEMES } from '../../store/useSettings'
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
  const filePathRef = useRef(filePath)
  const isFirstChangeRef = useRef(true)

  filePathRef.current = filePath

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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
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
        window.asterisk.writeFile(filePathRef.current, data)
      }, 500)
    },
    []
  )

  // Reset the first-change guard when switching files
  useEffect(() => {
    isFirstChangeRef.current = true
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [filePath])

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
