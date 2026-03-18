import { useState, useEffect, useCallback } from 'react'
import { X, Clock, RotateCcw, Trash2, ChevronRight, FileText } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import type { FileSnapshot } from '../../../../preload/types'
import './HistoryPanel.css'

interface HistoryPanelProps {
  onClose: () => void
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - ts
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  let relative: string
  if (diffMins < 1) relative = 'Just now'
  else if (diffMins < 60) relative = `${diffMins}m ago`
  else if (diffHours < 24) relative = `${diffHours}h ago`
  else if (diffDays < 7) relative = `${diffDays}d ago`
  else relative = date.toLocaleDateString()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${relative} · ${time}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function HistoryPanel({ onClose }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<FileSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)

  const workspacePath = workspaces[activeWorkspaceIndex]?.path ?? null

  const loadSnapshots = useCallback(async () => {
    if (!workspacePath || !openFile) {
      setSnapshots([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await window.asterisk.getSnapshots(workspacePath, openFile.path)
      if (result.ok && result.data) {
        setSnapshots(result.data)
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err)
    }
    setLoading(false)
  }, [workspacePath, openFile?.path])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  const handleSelectSnapshot = async (snapshot: FileSnapshot) => {
    if (selectedId === snapshot.id) {
      setSelectedId(null)
      setPreviewContent(null)
      return
    }

    setSelectedId(snapshot.id)
    setLoadingPreview(true)

    if (!workspacePath || !openFile) return

    try {
      const result = await window.asterisk.getSnapshotContent(
        workspacePath,
        openFile.path,
        snapshot.id
      )
      if (result.ok && result.data) {
        setPreviewContent(result.data.content)
      }
    } catch (err) {
      console.error('Failed to load snapshot content:', err)
    }
    setLoadingPreview(false)
  }

  const handleRestore = async () => {
    if (!previewContent || !openFile) return

    updateContent(previewContent)
    
    // Also save to disk
    if (workspacePath) {
      await window.asterisk.writeFile(openFile.path, previewContent)
    }
    
    onClose()
  }

  const handleDelete = async (snapshotId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!workspacePath || !openFile) return

    try {
      await window.asterisk.deleteSnapshot(workspacePath, openFile.path, snapshotId)
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId))
      if (selectedId === snapshotId) {
        setSelectedId(null)
        setPreviewContent(null)
      }
    } catch (err) {
      console.error('Failed to delete snapshot:', err)
    }
  }

  return (
    <div className="history-panel-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-panel-header">
          <div className="history-panel-title">
            <Clock size={18} />
            <span>Version History</span>
          </div>
          <button className="history-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="history-panel-file">
          <FileText size={14} />
          <span>{openFile?.name ?? 'No file selected'}</span>
        </div>

        <div className="history-panel-body">
          <div className="history-panel-list">
            {loading ? (
              <div className="history-panel-empty">Loading...</div>
            ) : snapshots.length === 0 ? (
              <div className="history-panel-empty">
                <Clock size={32} />
                <p>No history yet</p>
                <span>Snapshots are created automatically when you save</span>
              </div>
            ) : (
              snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className={`history-item${selectedId === snapshot.id ? ' history-item-selected' : ''}`}
                  onClick={() => handleSelectSnapshot(snapshot)}
                >
                  <div className="history-item-main">
                    <ChevronRight
                      size={14}
                      className={`history-item-chevron${selectedId === snapshot.id ? ' rotated' : ''}`}
                    />
                    <div className="history-item-info">
                      <span className="history-item-time">{formatTimestamp(snapshot.timestamp)}</span>
                      <span className="history-item-size">{formatSize(snapshot.size)}</span>
                    </div>
                  </div>
                  <button
                    className="history-item-delete"
                    onClick={(e) => handleDelete(snapshot.id, e)}
                    title="Delete snapshot"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {selectedId && (
            <div className="history-panel-preview">
              <div className="history-preview-header">
                <span>Preview</span>
                <button
                  className="history-restore-btn"
                  onClick={handleRestore}
                  disabled={!previewContent}
                >
                  <RotateCcw size={14} />
                  Restore this version
                </button>
              </div>
              <div className="history-preview-content">
                {loadingPreview ? (
                  <div className="history-preview-loading">Loading preview...</div>
                ) : previewContent ? (
                  <pre>{previewContent}</pre>
                ) : (
                  <div className="history-preview-loading">Failed to load preview</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
