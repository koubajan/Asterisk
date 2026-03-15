import { keymap } from '@codemirror/view'
import type { KeyBinding } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/** Check if a line looks like a markdown table row (contains |). */
function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 2
}

/** Count columns in a table row (number of |...| cells). */
function tableColumnCount(line: string): number {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return 0
  const cells = trimmed.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
  return cells.length
}

/** Get the table line range that includes the given pos. Returns null if not in a table. */
function getTableRange(view: EditorView, pos: number): { from: number; to: number; lines: string[] } | null {
  const doc = view.state.doc
  const line = doc.lineAt(pos)
  const lineText = line.text
  if (!isTableRow(lineText)) return null
  let topLineNum = line.number
  const lines: string[] = [lineText]
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = doc.line(n).text
    if (!isTableRow(prev)) break
    lines.unshift(prev)
    topLineNum = n
  }
  let bottomLineNum = line.number
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const next = doc.line(n).text
    if (!isTableRow(next)) break
    lines.push(next)
    bottomLineNum = n
  }
  const from = doc.line(topLineNum).from
  const to = doc.line(bottomLineNum).to
  return { from, to, lines }
}

/** Insert a markdown table at the cursor. Exported for /table command. */
export function insertTableAtCursor(view: EditorView, cols = 3, rows = 2): boolean {
  const { from } = view.state.selection.main
  const header = '| ' + Array(cols).fill('').join(' | ') + ' |'
  const separator = '| ' + Array(cols).fill('---').join(' | ') + ' |'
  const emptyRow = '| ' + Array(cols).fill('').join(' | ') + ' |'
  const body = Array(rows).fill(emptyRow).join('\n')
  const insert = header + '\n' + separator + '\n' + body + '\n'
  view.dispatch({
    changes: { from, insert },
    selection: EditorSelection.cursor(from + 2)
  })
  return true
}

function insertTable(view: EditorView, cols = 3, rows = 2): boolean {
  return insertTableAtCursor(view, cols, rows)
}

function addTableRow(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const range = getTableRange(view, from)
  if (!range || range.lines.length === 0) return false
  const lastLine = range.lines[range.lines.length - 1]
  const cols = tableColumnCount(lastLine)
  if (cols === 0) return false
  const newRow = '| ' + Array(cols).fill('').join(' | ') + ' |'
  const doc = view.state.doc
  const lastLineInfo = doc.lineAt(range.to - 1)
  const insertPos = lastLineInfo.to
  const insert = (lastLineInfo.text.endsWith('\n') ? '' : '\n') + newRow + '\n'
  view.dispatch({
    changes: { from: insertPos, insert },
    selection: EditorSelection.cursor(insertPos + insert.length - 1)
  })
  return true
}

function addTableColumn(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const range = getTableRange(view, from)
  if (!range || range.lines.length === 0) return false
  const newLines = range.lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed.endsWith('|')) return line
    return trimmed.slice(0, -1) + ' |  |'
  })
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: newLines.join('\n') },
    selection: EditorSelection.cursor(from)
  })
  return true
}

function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const changes = view.state.changeByRange((range) => {
    if (range.empty) {
      // No selection: insert markers and place cursor between them
      return {
        range: EditorSelection.cursor(range.from + before.length),
        changes: { from: range.from, insert: before + after }
      }
    }
    const selectedText = view.state.doc.sliceString(range.from, range.to)
    // Toggle: if already wrapped, unwrap
    if (selectedText.startsWith(before) && selectedText.endsWith(after) && selectedText.length > before.length + after.length) {
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
  return true
}

function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  if (from === to) {
    // No selection: insert markdown link template
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
  return true
}

export const markdownKeybindings: KeyBinding[] = [
  {
    key: 'Mod-b',
    run: (view) => wrapSelection(view, '**', '**')
  },
  {
    key: 'Mod-i',
    run: (view) => wrapSelection(view, '_', '_')
  },
  {
    key: 'Mod-k',
    run: insertLink
  },
  {
    key: 'Mod-Shift-t',
    run: (view) => insertTable(view, 3, 2)
  },
  {
    key: 'Mod-Alt-Enter',
    run: (view) => addTableRow(view)
  },
  {
    key: 'Mod-Alt-Shift-Enter',
    run: (view) => addTableColumn(view)
  }
]

export const markdownKeymap = keymap.of(markdownKeybindings)
