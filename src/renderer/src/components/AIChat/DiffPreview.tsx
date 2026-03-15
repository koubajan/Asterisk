import { useState, useMemo } from 'react'
import { diffLines } from 'diff'
import './AIChat.css'

interface DiffPreviewProps {
  oldContent: string
  newContent: string
  onApply: (newContent: string) => void
  onClose: () => void
}

function countLineChanges(oldContent: string, newContent: string): { added: number; removed: number } {
  const lineChanges = diffLines(oldContent, newContent)
  let added = 0
  let removed = 0
  for (const part of lineChanges) {
    const n = part.value ? (part.value.match(/\n/g)?.length ?? 0) + 1 : 0
    if (part.added) added += n
    if (part.removed) removed += n
  }
  return { added, removed }
}

export default function DiffPreview({ oldContent, newContent, onApply, onClose }: DiffPreviewProps) {
  const [edited, setEdited] = useState(newContent)

  const lineChanges = useMemo(() => diffLines(oldContent, edited), [oldContent, edited])

  const { added, removed } = useMemo(() => countLineChanges(oldContent, edited), [oldContent, edited])

  const hasChanges = added > 0 || removed > 0

  return (
    <div className="ai-diff-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ai-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-diff-header">
          <span>Preview changes</span>
          {hasChanges && (
            <span className="ai-diff-summary">
              <span className="ai-diff-summary-add">{added} added</span>
              <span className="ai-diff-summary-remove">{removed} removed</span>
            </span>
          )}
        </div>
        <div className="ai-diff-body ai-diff-unified">
          <div className="ai-diff-unified-content">
            {lineChanges.map((part, i) => {
              const lines = part.value.split('\n')
              if (lines[lines.length - 1] === '') lines.pop()
              return lines.map((line, j) => {
                const key = `${i}-${j}`
                if (part.added) {
                  return (
                    <div key={key} className="ai-diff-line ai-diff-line-add">
                      <span className="ai-diff-line-marker">+</span>
                      <span className="ai-diff-line-content">
                        {line || '\u00A0'}
                      </span>
                    </div>
                  )
                }
                if (part.removed) {
                  return (
                    <div key={key} className="ai-diff-line ai-diff-line-remove">
                      <span className="ai-diff-line-marker">−</span>
                      <span className="ai-diff-line-content">
                        {line || '\u00A0'}
                      </span>
                    </div>
                  )
                }
                return (
                  <div key={key} className="ai-diff-line ai-diff-line-same">
                    <span className="ai-diff-line-marker"> </span>
                    <span className="ai-diff-line-content">{line || '\u00A0'}</span>
                  </div>
                )
              })
            })
            }
          </div>
        </div>
        <div className="ai-diff-editable-section">
          <label className="ai-diff-editable-label">Edit before applying (optional)</label>
          <textarea
            className="ai-diff-editable-textarea"
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="ai-diff-footer">
          <button type="button" className="ai-diff-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ai-diff-btn primary" onClick={() => onApply(edited)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
