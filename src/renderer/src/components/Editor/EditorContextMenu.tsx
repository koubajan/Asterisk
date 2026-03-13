import { useState, useEffect, useCallback } from 'react'
import {
  Bold, Italic, Strikethrough, Code, Link, Heading1, Heading2, Heading3,
  Quote, List, ListOrdered, CheckSquare, Minus, ChevronRight, Copy, ClipboardPaste,
  Table, FileText
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

function insertMathInline(view: EditorView) {
  wrapSelection(view, '$', '$')
}

function insertMathBlock(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({
    changes: { from: line.to, insert: '\n\n$$\n\n$$\n' },
    selection: EditorSelection.cursor(line.to + 5)
  })
}

function insertFootnote(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const insert = '[^1]'
  view.dispatch({
    changes: { from, insert },
    selection: EditorSelection.cursor(from + insert.length)
  })
}

function insertTable(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const template = `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
|          |          |          |`
  view.dispatch({
    changes: { from, insert: template },
    selection: EditorSelection.cursor(from + template.length)
  })
}

function insertHorizontalRule(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({ changes: { from: line.to, insert: '\n\n---\n' } })
}

function copySelection(view: EditorView) {
  view.focus()
  const { from, to } = view.state.selection.main
  if (from === to) return
  const text = view.state.doc.sliceString(from, to)
  void navigator.clipboard.writeText(text)
}

function pasteAtCursor(view: EditorView) {
  view.focus()
  navigator.clipboard.readText().then((text) => {
    const { from } = view.state.selection.main
    view.dispatch({
      changes: { from, insert: text },
      selection: EditorSelection.cursor(from + text.length)
    })
  }).catch(() => {})
}

type IconComponent = React.ElementType

interface FormatItem {
  label: string
  icon: IconComponent
  shortcut?: string
  action: (v: EditorView) => void
}

interface ExpandableSection {
  id: string
  label: string
  icon: IconComponent
  items: FormatItem[]
}

const FORMAT_SECTION: ExpandableSection = {
  id: 'format',
  label: 'Format',
  icon: Bold,
  items: [
    { label: 'Bold', icon: Bold, shortcut: '⌘B', action: (v) => wrapSelection(v, '**', '**') },
    { label: 'Italic', icon: Italic, shortcut: '⌘I', action: (v) => wrapSelection(v, '_', '_') },
    { label: 'Strikethrough', icon: Strikethrough, action: (v) => wrapSelection(v, '~~', '~~') },
    { label: 'Code', icon: Code, action: (v) => wrapSelection(v, '`', '`') },
    { label: 'Math (inline)', icon: FileText, action: insertMathInline },
    { label: 'Math (block)', icon: FileText, action: insertMathBlock },
    { label: 'Heading 1', icon: Heading1, action: (v) => prefixLine(v, '# ') },
    { label: 'Heading 2', icon: Heading2, action: (v) => prefixLine(v, '## ') },
    { label: 'Heading 3', icon: Heading3, action: (v) => prefixLine(v, '### ') },
  ]
}

const PARAGRAPH_SECTION: ExpandableSection = {
  id: 'paragraph',
  label: 'Paragraph',
  icon: List,
  items: [
    { label: 'Bullet List', icon: List, action: (v) => prefixLine(v, '- ') },
    { label: 'Numbered List', icon: ListOrdered, action: (v) => prefixLine(v, '1. ') },
    { label: 'Task List', icon: CheckSquare, action: (v) => prefixLine(v, '- [ ] ') },
    { label: 'Quote', icon: Quote, action: (v) => prefixLine(v, '> ') },
  ]
}

const INSERT_SECTION: ExpandableSection = {
  id: 'insert',
  label: 'Insert',
  icon: Table,
  items: [
    { label: 'Table', icon: Table, action: insertTable },
    { label: 'Footnote', icon: FileText, action: insertFootnote },
    { label: 'Horizontal Rule', icon: Minus, action: insertHorizontalRule },
  ]
}

const STANDALONE_ITEMS: FormatItem[] = [
  { label: 'Copy', icon: Copy, action: copySelection },
  { label: 'Paste', icon: ClipboardPaste, action: pasteAtCursor },
  { label: 'Insert Link', icon: Link, shortcut: '⌘K', action: insertLink },
]

export default function EditorContextMenu({ editorView }: EditorContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.cm-editor')) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
    setExpanded(null)
  }, [])

  const handleClose = useCallback(() => {
    setMenu(null)
    setExpanded(null)
  }, [])

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClose)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClose)
    }
  }, [handleContextMenu, handleClose])

  if (!menu || !editorView) return null

  const runAndClose = (action: (v: EditorView) => void) => {
    action(editorView)
    setMenu(null)
  }

  const renderSection = (section: ExpandableSection) => {
    const isExpanded = expanded === section.id
    const SectionIcon = section.icon
    return (
      <div key={section.id} className="editor-ctx-section">
        <button
          type="button"
          className="editor-ctx-section-header"
          onClick={() => setExpanded(isExpanded ? null : section.id)}
        >
          <SectionIcon size={14} strokeWidth={1.6} />
          <span>{section.label}</span>
          <ChevronRight size={12} strokeWidth={1.6} className={`editor-ctx-chevron ${isExpanded ? 'expanded' : ''}`} />
        </button>
        {isExpanded && (
          <div className="editor-ctx-section-items">
            {section.items.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={i}
                  type="button"
                  className="editor-ctx-item editor-ctx-subitem"
                  onClick={() => runAndClose(item.action)}
                >
                  <Icon size={14} strokeWidth={1.6} />
                  <span>{item.label}</span>
                  {item.shortcut && <span className="editor-ctx-shortcut">{item.shortcut}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="editor-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {[FORMAT_SECTION, PARAGRAPH_SECTION, INSERT_SECTION].map(renderSection)}
      <div className="editor-ctx-separator" />
      {STANDALONE_ITEMS.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={i}
            type="button"
            className="editor-ctx-item"
            onClick={() => runAndClose(item.action)}
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
