import { useEffect, useRef, useCallback } from 'react'
import { useWorkspace } from './store/useWorkspace'
import { useArtifacts, getCanvasContentForSave } from './store/useArtifacts'
import { useAutoSave } from './hooks/useAutoSave'
import TopBar from './components/TopBar/TopBar'
import Sidebar from './components/Sidebar/Sidebar'
import EditorPane from './components/Editor/EditorPane'
import EditorTabs from './components/Editor/EditorTabs'
import Canvas from './components/Canvas/Canvas'
import PreviewPane from './components/Preview/PreviewPane'
import StatusBar from './components/StatusBar/StatusBar'
import SettingsModal from './components/Settings/SettingsModal'
import { useSettings, PRESET_THEMES } from './store/useSettings'

/** Lighten a hex color by a factor 0–1 (e.g. 0.04 adds ~4% lightness). */
function lightenHex(hex: string, factor: number): string {
  const n = hex.replace(/^#/, '')
  const r = Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) + (255 - parseInt(n.slice(0, 2), 16)) * factor))
  const g = Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) + (255 - parseInt(n.slice(2, 4), 16)) * factor))
  const b = Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) + (255 - parseInt(n.slice(4, 6), 16)) * factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export default function App() {
  const sidebarVisible = useWorkspace((s) => s.sidebarVisible)
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar)
  const previewVisible = useWorkspace((s) => s.previewVisible)
  const centerRef = useRef<HTMLDivElement>(null)

  const { activeThemeId, customThemes, typography, editorPreviewRatio, setEditorPreviewRatio } = useSettings()

  const handleResize = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX
    const startRatio = editorPreviewRatio
    const center = centerRef.current
    if (!center) return

    function onMouseMove(move: MouseEvent) {
      const w = center?.getBoundingClientRect().width ?? 0
      if (w <= 0) return
      const dx = move.clientX - startX
      const newRatio = Math.max(0.2, Math.min(0.8, startRatio + dx / w))
      setEditorPreviewRatio(newRatio)
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [editorPreviewRatio, setEditorPreviewRatio])

  useEffect(() => {
    const allThemes = [...PRESET_THEMES, ...customThemes]
    const theme = allThemes.find((t) => t.id === activeThemeId) || PRESET_THEMES[0]

    const root = document.documentElement
    root.style.setProperty('--accent', theme.colors.accentColor)
    root.style.setProperty('--bg-base', theme.colors.bgBase)
    root.style.setProperty('--text-primary', theme.colors.textPrimary)
    // Editor area slightly lighter than sidebar for visual hierarchy
    const editorBg = lightenHex(theme.colors.bgBase, 0.04)
    root.style.setProperty('--bg-editor', editorBg)

    let uiFont = "var(--font-ui)"
    if (typography === 'serif') uiFont = "Georgia, serif"
    else if (typography === 'mono') uiFont = "var(--font-mono)"
    document.body.style.fontFamily = uiFont
  }, [activeThemeId, customThemes, typography])

  // Auto-save hook
  useAutoSave()

  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const isCanvasOpen = openFile?.path.endsWith('.artifact') ?? false
  const updateContent = useWorkspace((s) => s.updateContent)
  const markSaved = useWorkspace((s) => s.markSaved)
  const loadCanvas = useArtifacts((s) => s.loadCanvas)
  const closeCanvas = useArtifacts((s) => s.closeCanvas)
  const artifactsMarkSaved = useArtifacts((s) => s.markSaved)

  useEffect(() => {
    if (isCanvasOpen && openFile) {
      loadCanvas(openFile.path, openFile.content)
    } else {
      closeCanvas()
    }
  }, [isCanvasOpen, openFile?.path, openFile?.content, loadCanvas, closeCanvas])

  useEffect(() => {
    if (!isCanvasOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const content = getCanvasContentForSave()
        if (content && openFile) {
          window.asterisk.writeFile(openFile.path, content).then((result) => {
            if (result.ok) {
              updateContent(content)
              artifactsMarkSaved()
              markSaved()
            }
          })
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isCanvasOpen, openFile?.path, updateContent, markSaved, artifactsMarkSaved])

  // Listen for menu events from main process
  useEffect(() => {
    const ipc = (window as any).electron?.ipcRenderer
    if (!ipc) return

    const unsubSidebar = ipc.on('menu:toggle-sidebar', toggleSidebar)

    return () => {
      unsubSidebar?.()
    }
  }, [toggleSidebar])

  return (
    <>
      <TopBar />
      <div className="workspace">
        {sidebarVisible && <Sidebar />}
        <div ref={centerRef} className="workspace-center">
          <div
            className="workspace-editor-wrap"
            style={{
              flex: previewVisible && !isCanvasOpen ? editorPreviewRatio : 1,
              minWidth: 0
            }}
          >
            <EditorTabs />
            <div className="workspace-editor-content">
              {isCanvasOpen ? <Canvas /> : <EditorPane />}
            </div>
          </div>
          {previewVisible && !isCanvasOpen && (
            <>
              <div
                className="workspace-resizer"
                onMouseDown={handleResize}
                title="Drag to resize"
                role="separator"
                aria-orientation="vertical"
              />
              <div className="workspace-preview-wrap" style={{ flex: 1 - editorPreviewRatio, minWidth: 0 }}>
                <PreviewPane />
              </div>
            </>
          )}
        </div>
      </div>
      <StatusBar />
      <SettingsModal />
    </>
  )
}
