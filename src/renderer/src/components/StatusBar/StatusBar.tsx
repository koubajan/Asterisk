import { useWorkspace } from '../../store/useWorkspace'
import './StatusBar.css'

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function charCount(text: string): number {
  return text.length
}

export default function StatusBar() {
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)

  if (!openFile) {
    return (
      <footer className="statusbar">
        <span>Asterisk · Markdown Editor</span>
      </footer>
    )
  }

  const words = wordCount(openFile.content)
  const chars = charCount(openFile.content)

  return (
    <footer className="statusbar">
      <span className="statusbar-filename">{openFile.name}</span>

      <div className="statusbar-saved">
        <span className={`statusbar-saved-dot ${openFile.isDirty ? 'dirty' : ''}`} />
        <span>{openFile.isDirty ? 'Unsaved' : 'Saved'}</span>
      </div>

      <div className="statusbar-spacer" />

      <span className="statusbar-wordcount">
        {words} {words === 1 ? 'word' : 'words'} · {chars} chars
      </span>
    </footer>
  )
}
