import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard,
  FilePlus,
  Save,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Check,
  X,
  Settings,
  Download,
  FileText,
  FileCode,
  Printer,
  Sparkles
} from 'lucide-react'
import { marked } from 'marked'
import { useWorkspace } from '../../store/useWorkspace'
import { useFileOps } from '../../hooks/useFileOps'
import { useSettings } from '../../store/useSettings'
import './TopBar.css'

function getBaseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function exportAsHtml(content: string, fileName: string) {
  const html = marked.parse(content) as string
  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${fileName}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2em auto;padding:0 1em;line-height:1.6;color:#333}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:1em;border-radius:6px;overflow-x:auto}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#666}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style>
</head><body>${html}</body></html>`
  downloadBlob(fullHtml, `${getBaseName(fileName)}.html`, 'text/html')
}

function exportAsText(content: string, fileName: string) {
  downloadBlob(content, `${getBaseName(fileName)}.txt`, 'text/plain')
}

function exportAsMarkdown(content: string, fileName: string) {
  downloadBlob(content, fileName.endsWith('.md') ? fileName : `${getBaseName(fileName)}.md`, 'text/markdown')
}

function exportAsPdf(content: string, fileName: string) {
  const html = marked.parse(content) as string
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${fileName}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2em auto;padding:0 1em;line-height:1.6;color:#333}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:1em;border-radius:6px;overflow-x:auto}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#666}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}
@media print{body{margin:0}}</style>
</head><body>${html}</body></html>`)
  win.document.close()
  setTimeout(() => { win.print() }, 250)
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

interface TopBarProps {
  onOpenAIPanel?: () => void
}

export default function TopBar({ onOpenAIPanel }: TopBarProps = {}) {
  const { openFolder, createFile } = useFileOps()
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeIdx = useWorkspace((s) => s.activeWorkspaceIndex)
  const folderPath = workspaces[activeIdx]?.path
  const sidebarVisible = useWorkspace((s) => s.sidebarVisible)
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar)
  const previewVisible = useWorkspace((s) => s.previewVisible)
  const togglePreview = useWorkspace((s) => s.togglePreview)
  const markSaved = useWorkspace((s) => s.markSaved)
  const openSettings = useSettings((s) => s.openSettings)

  const [creatingFile, setCreatingFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (creatingFile) setTimeout(() => inputRef.current?.focus(), 50)
  }, [creatingFile])

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [exportOpen])

  async function handleSave() {
    if (!openFile) return
    await window.asterisk.writeFile(openFile.path, openFile.content)
    markSaved()
  }

  async function handleNewFileSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = newFileName.trim()
    if (!name) return
    setCreatingFile(false)
    setNewFileName('')
    await createFile(name)
  }

  return (
    <header className="topbar">
      {/* Open workspace */}
      <button className="topbar-btn" onClick={openFolder} title="Open workspace (⌘⇧O)">
        <LayoutDashboard size={13} strokeWidth={1.7} />
        Open Workspace
      </button>

      {/* New file */}
      {folderPath && (
        <>
          <div className="topbar-divider" />
          {creatingFile ? (
            <form className="topbar-new-form" onSubmit={handleNewFileSubmit}>
              <input
                ref={inputRef}
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setCreatingFile(false); setNewFileName('') }
                }}
                placeholder="note-name"
              />
              <button className="topbar-btn active" type="submit">
                <Check size={12} strokeWidth={2} /> Create
              </button>
              <button
                className="topbar-btn"
                type="button"
                onClick={() => { setCreatingFile(false); setNewFileName('') }}
              >
                <X size={12} strokeWidth={2} /> Cancel
              </button>
            </form>
          ) : (
            <button className="topbar-btn" onClick={() => setCreatingFile(true)} title="New File (⌘N)">
              <FilePlus size={13} strokeWidth={1.7} />
              New File
            </button>
          )}
        </>
      )}

      <div className="topbar-spacer" />

      {/* Brand - Centered Absolutely */}
      <div className="topbar-brand">
        <span className="topbar-brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64L5.64 18.36" />
          </svg>
        </span>
        <span className="topbar-brand-name">Asterisk</span>
      </div>

      {/* Export */}
      {openFile && (
        <div className="topbar-export-wrap" ref={exportRef}>
          <button
            className="topbar-btn"
            onClick={() => setExportOpen(!exportOpen)}
            title="Export file"
          >
            <Download size={13} strokeWidth={1.7} />
            Export
          </button>
          {exportOpen && (
            <div className="topbar-export-dropdown">
              <button title="Export as HTML file" onClick={() => { exportAsHtml(openFile.content, openFile.name); setExportOpen(false) }}>
                <FileCode size={14} strokeWidth={1.5} /> HTML
              </button>
              <button title="Export as plain text" onClick={() => { exportAsText(openFile.content, openFile.name); setExportOpen(false) }}>
                <FileText size={14} strokeWidth={1.5} /> Plain Text
              </button>
              <button title="Export as Markdown file" onClick={() => { exportAsMarkdown(openFile.content, openFile.name); setExportOpen(false) }}>
                <FileText size={14} strokeWidth={1.5} /> Markdown
              </button>
              <div className="topbar-export-sep" />
              <button title="Open print dialog (save as PDF)" onClick={() => { exportAsPdf(openFile.content, openFile.name); setExportOpen(false) }}>
                <Printer size={14} strokeWidth={1.5} /> Print / PDF
              </button>
            </div>
          )}
        </div>
      )}

      {/* View toggles */}
      <button
        className={`topbar-toggle ${sidebarVisible ? 'on' : ''}`}
        onClick={toggleSidebar}
        title={`${sidebarVisible ? 'Hide' : 'Show'} Sidebar (⌘⇧B)`}
      >
        {sidebarVisible ? <PanelLeft size={15} strokeWidth={1.6} /> : <PanelLeftClose size={15} strokeWidth={1.6} />}
      </button>
      <button
        className={`topbar-toggle ${previewVisible ? 'on' : ''}`}
        onClick={togglePreview}
        title={`${previewVisible ? 'Hide' : 'Show'} Preview`}
      >
        {previewVisible ? <PanelRight size={15} strokeWidth={1.6} /> : <PanelRightClose size={15} strokeWidth={1.6} />}
      </button>

      {/* AI Assistant */}
      {onOpenAIPanel && (
        <button
          className="topbar-toggle"
          onClick={onOpenAIPanel}
          title="AI Assistant"
        >
          <Sparkles size={15} strokeWidth={1.6} />
        </button>
      )}
      {/* Settings */}
      <button
        className="topbar-toggle"
        onClick={openSettings}
        title="Settings"
      >
        <Settings size={15} strokeWidth={1.6} />
      </button>

      {/* Save */}
      {openFile && (
        <>
          <div className="topbar-divider" />
          <button
            className={`topbar-btn ${openFile.isDirty ? 'save-dirty' : ''}`}
            onClick={handleSave}
            title="Save (⌘S)"
          >
            <Save size={13} strokeWidth={1.7} />
            {openFile.isDirty ? 'Save' : 'Saved'}
          </button>
        </>
      )}
    </header>
  )
}
