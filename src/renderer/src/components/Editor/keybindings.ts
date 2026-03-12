import { keymap } from '@codemirror/view'
import type { KeyBinding } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

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
  }
]

export const markdownKeymap = keymap.of(markdownKeybindings)
