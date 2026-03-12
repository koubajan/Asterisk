import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const CURSOR_PADDING = 2

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo
}

/** Returns true if the range [rangeFrom, rangeTo] is near cursor/selection */
function isNearCursor(
  rangeFrom: number,
  rangeTo: number,
  revealFrom: number,
  revealTo: number
): boolean {
  return rangesOverlap(rangeFrom, rangeTo, revealFrom, revealTo)
}

interface HiddenRange {
  from: number
  to: number
}

function buildRevealRange(view: EditorView): { from: number; to: number } {
  const docLen = view.state.doc.length
  const sel = view.state.selection.main
  const selFrom = sel.from
  const selTo = sel.to
  // Symmetric padding: CURSOR_PADDING chars on each side of cursor/selection
  const revealFrom = Math.max(0, selFrom - CURSOR_PADDING)
  const revealTo = Math.min(docLen, selTo + CURSOR_PADDING)
  return { from: revealFrom, to: revealTo }
}

function buildHiddenDecorations(view: EditorView): DecorationSet {
  const { from: revealFrom, to: revealTo } = buildRevealRange(view)
  const ranges: HiddenRange[] = []

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      if (line.from >= to) break

      const text = line.text
      const lineStart = line.from

      // Headings: hide leading ### and space (reveal when cursor/hover near)
      {
        const m = text.match(/^#{1,6}\s+/)
        if (m) {
          const start = lineStart
          const end = lineStart + m[0].length
          if (!isNearCursor(start, end, revealFrom, revealTo)) {
            ranges.push({ from: start, to: end })
          }
        }
      }

      // Bold **strong** — reveal when cursor/hover near any part of the construct
      {
        const re = /\*\*(.+?)\*\*/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: fullStart + 2 }) // leading **
          ranges.push({ from: fullEnd - 2, to: fullEnd })     // trailing **
        }
      }

      // Italic *em* and _em_
      {
        const re = /(\*|_)([^*_]+?)\1/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: fullStart + 1 }) // leading * or _
          ranges.push({ from: fullEnd - 1, to: fullEnd })     // trailing * or _
        }
      }

      // Strikethrough ~~del~~
      {
        const re = /~~(.+?)~~/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: fullStart + 2 })
          ranges.push({ from: fullEnd - 2, to: fullEnd })
        }
      }

      // Links [text](url) — show only the label when not editing; reveal entire link when cursor/hover anywhere in link (including URL)
      {
        const re = /\[([^\]]+)\]\(([^)]+)\)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          const labelStart = fullStart + 1
          const labelEnd = labelStart + m[1].length
          // Reveal when cursor/hover is anywhere in the full link (label or URL)
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: labelStart }) // leading '['
          ranges.push({ from: labelEnd, to: fullEnd })     // ](url)
        }
      }

      // Images ![alt](src) — hide the entire syntax (reveal when cursor/hover near)
      {
        const re = /!\[([^\]]*)\]\(([^)]+)\)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          if (!isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) {
            ranges.push({ from: fullStart, to: fullEnd })
          }
        }
      }

      // List markers at start of line: -, *, +, or numbered lists "1. "
      {
        const listMatch = text.match(/^(\s*)([-*+]\s+|\d+\.\s+)/)
        if (listMatch) {
          const start = lineStart + listMatch[1].length
          const end = start + listMatch[2].length
          if (!isNearCursor(start, end, revealFrom, revealTo)) {
            ranges.push({ from: start, to: end })
          }
        }
      }

      // Task list checkbox: - [ ] or - [x] — hide the [ ] / [x] part
      {
        const taskMatch = text.match(/^(\s*[-*+]\s+)(\[[ xX]\])\s*/)
        if (taskMatch) {
          const boxStart = lineStart + taskMatch[1].length
          const boxEnd = boxStart + taskMatch[2].length
          if (!isNearCursor(boxStart, boxEnd, revealFrom, revealTo)) {
            ranges.push({ from: boxStart, to: boxEnd })
          }
        }
      }

      // Blockquotes: hide leading ">" and space
      {
        const m = text.match(/^>\s+/)
        if (m) {
          const start = lineStart
          const end = lineStart + m[0].length
          if (!isNearCursor(start, end, revealFrom, revealTo)) {
            ranges.push({ from: start, to: end })
          }
        }
      }

      // Horizontal rules: ---, ***, ___ (hide entire line when it's only the rule)
      {
        const m = text.match(/^(\s*)([-*_]{3,})\s*$/)
        if (m) {
          const start = lineStart + m[1].length
          const end = lineStart + m[0].length
          if (!isNearCursor(start, end, revealFrom, revealTo)) {
            ranges.push({ from: start, to: end })
          }
        }
      }

      // Inline code `code` — hide backticks
      {
        const re = /`([^`]+)`/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: fullStart + 1 })   // leading `
          ranges.push({ from: fullEnd - 1, to: fullEnd })       // trailing `
        }
      }

      // Wiki links [[Note Name]] — hide brackets, show inner text
      {
        const re = /\[\[([^\]]+)\]\]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const fullStart = lineStart + m.index
          const fullEnd = fullStart + m[0].length
          const innerStart = fullStart + 2
          const innerEnd = fullEnd - 2
          if (isNearCursor(fullStart, fullEnd, revealFrom, revealTo)) continue
          ranges.push({ from: fullStart, to: innerStart })   // leading [[
          ranges.push({ from: innerEnd, to: fullEnd })       // trailing ]]
        }
      }

      pos = line.to + 1
    }
  }

  if (ranges.length === 0) return Decoration.none

  // Sort ranges by `from` (and then `to`) so RangeSetBuilder gets them in order
  ranges.sort((a, b) => (a.from - b.from) || (a.to - b.to))

  const builder = new RangeSetBuilder<Decoration>()
  for (const r of ranges) {
    builder.add(r.from, r.to, Decoration.mark({ class: 'cm-md-hidden' }))
  }

  return builder.finish()
}

const markdownHideSyntaxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHiddenDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildHiddenDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

/** Extensions for hiding markdown syntax with cursor reveal (use by spreading into editor extensions) */
export const markdownHideSyntax = [markdownHideSyntaxPlugin]

