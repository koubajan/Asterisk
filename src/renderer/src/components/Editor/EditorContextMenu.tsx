import { useState, useEffect, useCallback } from 'react'
import {
  Bold, Italic, Strikethrough, Code, Link, Heading1, Heading2, Heading3,
  Quote, List, ListOrdered, CheckSquare, Minus
} from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import './EditorContextMenu.css'

interface MenuState {
  x: number
  y: number
}

interface EditorContextMenuProps {
  editorView: EditorView | null
}

function wrapSelection(view: EditorView, before: string, after: string) {
  view.focus()
  const changes = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        range: EditorSelection.cursor(range.from + before.length),
        changes: { from: range.from, insert: before + after }
      }
    }
    const selectedText = view.state.doc.sliceString(range.from, range.to)
    if (
      selectedText.startsWith(before) &&
      selectedText.endsWith(after) &&
      selectedText.length > before.length + after.length
    ) {
      const inner = selectedText.slice(before.length, selectedText.length - after.length)
      return {
        range: EditorSelection.range(range.from, range.from + inner.length),
        changes: { from: range.from, to: range.to, insert: inner }
      }
    }
    return {
      range: EditorSelection.range(range.from, range.to + before.length + after.length),
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after }
      ]
    }
  })
  view.dispatch(changes)
}

function prefixLine(view: EditorView, prefix: string) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text

  if (lineText.startsWith(prefix)) {
    // Remove prefix
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' }
    })
  } else {
    view.dispatch({
      changes: { from: line.from, insert: prefix }
    })
  }
}

function insertLink(view: EditorView) {
  view.focus()
  const { from, to } = view.state.selection.main
  if (from === to) {
    const insert = '[text](url)'
    view.dispatch({
      changes: { from, insert },
      selection: EditorSelection.range(from + 1, from + 5)
    })
  } else {
    const selectedText = view.state.doc.sliceString(from, to)
    const insert = `[${selectedText}](url)`
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.range(from + selectedText.length + 3, from + insert.length - 1)
    })
  }
}

const MENU_ITEMS = [
  { label: 'Bold', icon: Bold, shortcut: '⌘B', action: (v: EditorView) => wrapSelection(v, '**', '**') },
  { label: 'Italic', icon: Italic, shortcut: '⌘I', action: (v: EditorView) => wrapSelection(v, '_', '_') },
  { label: 'Strikethrough', icon: Strikethrough, shortcut: '', action: (v: EditorView) => wrapSelection(v, '~~', '~~') },
  { label: 'Code', icon: Code, shortcut: '', action: (v: EditorView) => wrapSelection(v, '`', '`') },
  { type: 'separator' as const },
  { label: 'Heading 1', icon: Heading1, shortcut: '', action: (v: EditorView) => prefixLine(v, '# ') },
  { label: 'Heading 2', icon: Heading2, shortcut: '', action: (v: EditorView) => prefixLine(v, '## ') },
  { label: 'Heading 3', icon: Heading3, shortcut: '', action: (v: EditorView) => prefixLine(v, '### ') },
  { type: 'separator' as const },
  { label: 'Link', icon: Link, shortcut: '⌘K', action: insertLink },
  { label: 'Quote', icon: Quote, shortcut: '', action: (v: EditorView) => prefixLine(v, '> ') },
  { label: 'Bullet List', icon: List, shortcut: '', action: (v: EditorView) => prefixLine(v, '- ') },
  { label: 'Numbered List', icon: ListOrdered, shortcut: '', action: (v: EditorView) => prefixLine(v, '1. ') },
  { label: 'Task List', icon: CheckSquare, shortcut: '', action: (v: EditorView) => prefixLine(v, '- [ ] ') },
  { type: 'separator' as const },
  { label: 'Horizontal Rule', icon: Minus, shortcut: '', action: (v: EditorView) => {
    v.focus()
    const { from } = v.state.selection.main
    const line = v.state.doc.lineAt(from)
    v.dispatch({ changes: { from: line.to, insert: '\n\n---\n' } })
  }},
] as const

export default function EditorContextMenu({ editorView }: EditorContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    // Only show if inside the cm-editor
    const target = e.target as HTMLElement
    if (!target.closest('.cm-editor')) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleClose = useCallback(() => setMenu(null), [])

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClose)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClose)
    }
  }, [handleContextMenu, handleClose])

  if (!menu || !editorView) return null

  return (
    <div
      className="editor-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {MENU_ITEMS.map((item, i) => {
        if ('type' in item && item.type === 'separator') {
          return <div key={i} className="editor-ctx-separator" />
        }
        if (!('label' in item)) return null
        const Icon = item.icon
        return (
          <button
            key={i}
            className="editor-ctx-item"
            onClick={() => {
              item.action(editorView)
              setMenu(null)
            }}
          >
            <Icon size={14} strokeWidth={1.6} />
            <span>{item.label}</span>
            {item.shortcut && <span className="editor-ctx-shortcut">{item.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}
