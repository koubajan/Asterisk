import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { EditorState, Prec, Range, StateField } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { isLivePreviewMode } from './editorModeRef'
import { mountPreviewEditableTable } from '../Preview/createEditableTableDom'

let lastMermaidFieldLive: boolean | null = null
let lastTableFieldLive: boolean | null = null

// ── Mermaid init + SVG cache (dynamic import — avoids loading mermaid on startup) ──

const mermaidSvgCache = new Map<string, string>()
let mermaidIdCounter = 0

type MermaidAPI = typeof import('mermaid').default
let mermaidSingleton: MermaidAPI | null = null
let mermaidLoadPromise: Promise<MermaidAPI> | null = null

async function getMermaid(): Promise<MermaidAPI> {
  if (mermaidSingleton) return mermaidSingleton
  if (!mermaidLoadPromise) {
    mermaidLoadPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'var(--font-mono, monospace)',
        themeVariables: {
          primaryColor: '#3b82f6',
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#60a5fa',
          lineColor: '#6b7280',
          secondaryColor: '#1e293b',
          tertiaryColor: '#0f172a',
          background: '#0f172a',
          mainBkg: '#1e293b',
          secondBkg: '#334155',
          nodeBorder: '#475569',
          clusterBkg: '#1e293b',
          clusterBorder: '#475569',
          titleColor: '#f1f5f9',
          edgeLabelBackground: '#1e293b',
          textColor: '#e2e8f0',
          nodeTextColor: '#f1f5f9'
        }
      })
      mermaidSingleton = mermaid
      return mermaid
    })
  }
  return mermaidLoadPromise
}

// ── Helpers ──────────────────────────────────────────────────────────

const hiddenMark = Decoration.mark({
  class: 'cm-md-hidden',
  attributes: { style: 'display:none !important' }
})
const codeBlockLineDeco = Decoration.line({ class: 'cm-md-codeblock-line' })
const fenceLangRe = /^\s{0,3}(`{3,}|~{3,})(\w*)/

function cursorWithin(state: EditorState, from: number, to: number): boolean {
  const sel = state.selection.main
  return sel.from <= to && sel.to >= from
}

function skipSpaces(state: EditorState, pos: number): number {
  const doc = state.doc
  let p = pos
  while (p < doc.length) {
    const ch = doc.sliceString(p, p + 1)
    if (ch !== ' ' && ch !== '\t') break
    p++
  }
  return p
}

function fencedCodeLang(state: EditorState, nodeFrom: number): string {
  const line = state.doc.lineAt(nodeFrom)
  const m = line.text.match(fenceLangRe)
  return m?.[2]?.toLowerCase() || ''
}

function listItemHasTask(listItem: { firstChild: { name: string; nextSibling: typeof listItem.firstChild } | null }): boolean {
  let child = listItem.firstChild
  while (child) {
    if (child.name === 'Task') return true
    child = child.nextSibling
  }
  return false
}

// ── Replacement Widgets ──────────────────────────────────────────────

class HRWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-hr'
    el.setAttribute('role', 'presentation')
    return el
  }
  eq() { return true }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markerFrom: number,
    readonly markerTo: number
  ) { super() }

  toDOM(view: EditorView) {
    const el = document.createElement('span')
    el.className = `cm-md-checkbox ${this.checked ? 'cm-md-checkbox-checked' : ''}`
    if (this.checked) el.textContent = '✓'

    const { markerFrom, markerTo } = this
    el.addEventListener('mousedown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      e.stopPropagation()
      const text = view.state.doc.sliceString(markerFrom, markerTo)
      const toggled = /[xX]/.test(text) ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: markerFrom, to: markerTo, insert: toggled } })
    })

    return el
  }

  ignoreEvent(event: Event): boolean {
    if (event.type === 'mousedown' && event instanceof MouseEvent && (event.metaKey || event.ctrlKey)) {
      return false
    }
    return true
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked
      && this.markerFrom === other.markerFrom
      && this.markerTo === other.markerTo
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-bullet'
    el.textContent = '•'
    return el
  }
  eq() { return true }
}

class CodeFenceWidget extends WidgetType {
  constructor(readonly lang: string) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-fence-label'
    if (this.lang) el.textContent = this.lang
    return el
  }
  eq(other: CodeFenceWidget) { return this.lang === other.lang }
}

class MermaidWidget extends WidgetType {
  constructor(readonly code: string, readonly codeFrom: number) { super() }

  toDOM(view: EditorView) {
    const container = document.createElement('div')
    container.className = 'cm-md-mermaid'

    const { codeFrom } = this
    container.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({ selection: { anchor: codeFrom } })
      view.focus()
    })

    const cached = mermaidSvgCache.get(this.code)
    if (cached) {
      container.innerHTML = cached
      return container
    }

    container.innerHTML = '<div class="cm-md-mermaid-loading">Rendering diagram\u2026</div>'
    this.renderAsync(container)
    return container
  }

  private async renderAsync(el: HTMLElement) {
    try {
      const mermaid = await getMermaid()
      const id = `cm-mm-${++mermaidIdCounter}`
      await mermaid.parse(this.code)
      const { svg } = await mermaid.render(id, this.code)
      mermaidSvgCache.set(this.code, svg)
      el.innerHTML = svg
    } catch {
      el.innerHTML = '<div class="cm-md-mermaid-error">\u26A0 Invalid Mermaid diagram</div>'
    }
  }

  ignoreEvent(event: Event): boolean {
    if (event.type === 'mousedown') return false
    return true
  }

  eq(other: MermaidWidget) { return this.code === other.code && this.codeFrom === other.codeFrom }
  get estimatedHeight() { return 200 }
}

/** True if selection touches any ancestor `Table` node (full table, not just a row). */
function cursorWithinTableAncestor(state: EditorState, leaf: { parent: { name: string; from: number; to: number; parent: unknown } | null }): boolean {
  let p: { name: string; from: number; to: number; parent: unknown } | null = leaf.parent
  while (p) {
    if (p.name === 'Table') return cursorWithin(state, p.from, p.to)
    p = p.parent as typeof p | null
  }
  return false
}

class MarkdownTableLiveWidget extends WidgetType {
  constructor(readonly tableFrom: number, readonly tableTo: number) {
    super()
  }

  eq(other: MarkdownTableLiveWidget) {
    return this.tableFrom === other.tableFrom && this.tableTo === other.tableTo
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    const { tableFrom, tableTo } = this
    const md = view.state.doc.sliceString(tableFrom, tableTo)
    const { destroy } = mountPreviewEditableTable(wrap, {
      markdown: md,
      onChange: (next) => {
        view.dispatch({ changes: { from: tableFrom, to: tableTo, insert: next } })
      }
    })
    ;(wrap as HTMLElement & { __mdTableUnmount?: () => void }).__mdTableUnmount = destroy
    return wrap
  }

  destroy(dom: HTMLElement): void {
    ;(dom as HTMLElement & { __mdTableUnmount?: () => void }).__mdTableUnmount?.()
  }

  // Use WidgetType default ignoreEvent (always true): editor must not handle
  // pointer/keyboard events here, or it moves the doc selection and drops the
  // table widget (cursor “leaves” the table → raw markdown flashes / wrong focus).

  get estimatedHeight() {
    return 200
  }
}

// ── Mermaid StateField (block decorations must use StateField) ────────

function buildMermaidDecos(state: EditorState): DecorationSet {
  if (!isLivePreviewMode()) return Decoration.none
  const decos: Range<Decoration>[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return

      if (cursorWithin(state, node.from, node.to)) return false

      const lang = fencedCodeLang(state, node.from)
      if (lang !== 'mermaid') return false

      const firstLine = state.doc.lineAt(node.from)
      const lastLine = state.doc.lineAt(node.to)
      if (lastLine.number <= firstLine.number + 1) return false

      const codeStartLine = state.doc.line(firstLine.number + 1)
      const codeEndLine = state.doc.line(lastLine.number - 1)
      const mermaidCode = state.doc.sliceString(codeStartLine.from, codeEndLine.to).trim()
      if (!mermaidCode) return false

      decos.push(
        Decoration.replace({
          widget: new MermaidWidget(mermaidCode, codeStartLine.from),
          block: true
        }).range(firstLine.from, lastLine.to)
      )

      return false
    }
  })

  return Decoration.set(decos, true)
}

const mermaidField = StateField.define<DecorationSet>({
  create(state) {
    lastMermaidFieldLive = isLivePreviewMode()
    return buildMermaidDecos(state)
  },
  update(_value, tr) {
    const live = isLivePreviewMode()
    const selectionChanged = !tr.startState.selection.eq(tr.newSelection)
    if (tr.docChanged || selectionChanged || tr.reconfigured || lastMermaidFieldLive !== live) {
      lastMermaidFieldLive = live
      return buildMermaidDecos(tr.state)
    }
    return _value
  },
  provide: (f) => EditorView.decorations.from(f)
})

// ── Markdown table StateField (editable rendered table in live preview) ─

function buildTableLiveDecos(state: EditorState): DecorationSet {
  if (!isLivePreviewMode()) return Decoration.none
  const decos: Range<Decoration>[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return
      if (cursorWithin(state, node.from, node.to)) return false
      decos.push(
        Decoration.replace({
          widget: new MarkdownTableLiveWidget(node.from, node.to),
          block: true
        }).range(node.from, node.to)
      )
      return false
    }
  })

  return Decoration.set(decos, true)
}

const tableLiveField = StateField.define<DecorationSet>({
  create(state) {
    lastTableFieldLive = isLivePreviewMode()
    return buildTableLiveDecos(state)
  },
  update(_value, tr) {
    const live = isLivePreviewMode()
    const selectionChanged = !tr.startState.selection.eq(tr.newSelection)
    if (tr.docChanged || selectionChanged || tr.reconfigured || lastTableFieldLive !== live) {
      lastTableFieldLive = live
      return buildTableLiveDecos(tr.state)
    }
    return _value
  },
  provide: (f) => EditorView.decorations.from(f)
})

// ── ViewPlugin decorations (inline / line only – no block replace) ───

function buildDecorations(view: EditorView): DecorationSet {
  if (!isLivePreviewMode()) return Decoration.none
  const { state } = view
  const decos: Range<Decoration>[] = []
  const tree = syntaxTree(state)

  function hide(from: number, to: number) {
    if (from < to) decos.push(hiddenMark.range(from, to))
  }

  for (const vr of view.visibleRanges) {
    tree.iterate({
      from: vr.from,
      to: vr.to,
      enter(node) {
        const parent = node.node.parent

        switch (node.name) {

          // ── Heading marks: # ## ### + trailing space ──────────
          case 'HeaderMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, skipSpaces(state, node.to))
            return
          }

          // ── Emphasis marks: * _ ** __ *** ___ ────────────────
          case 'EmphasisMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Strikethrough marks: ~~ ──────────────────────────
          case 'StrikethroughMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Subscript marks: ~ ───────────────────────────────
          case 'SubscriptMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Superscript marks: ^ ─────────────────────────────
          case 'SuperscriptMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Inline code backticks only (fenced handled below) ─
          case 'CodeMark': {
            if (!parent || parent.name !== 'InlineCode') return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Fenced code blocks ─────────────────────────────────
          case 'FencedCode': {
            const firstLine = state.doc.lineAt(node.from)
            const lastLine = state.doc.lineAt(node.to)
            const lang = fencedCodeLang(state, node.from)
            const editing = cursorWithin(state, node.from, node.to)

            // Mermaid blocks: the StateField handles diagram rendering
            // when the cursor is outside; skip all ViewPlugin decos.
            if (lang === 'mermaid' && !editing) return false

            // Background for all lines
            let lp = node.from
            while (lp <= node.to) {
              const line = state.doc.lineAt(lp)
              decos.push(codeBlockLineDeco.range(line.from))
              lp = line.to + 1
            }

            // Replace fence lines with widgets when not editing
            if (!editing) {
              decos.push(
                Decoration.replace({ widget: new CodeFenceWidget(lang) })
                  .range(firstLine.from, firstLine.to)
              )

              if (lastLine.number > firstLine.number) {
                if (lastLine.from < lastLine.to) {
                  decos.push(
                    Decoration.replace({}).range(lastLine.from, lastLine.to)
                  )
                }
              }
            }

            return false
          }

          // ── Indented code blocks: just background ─────────────
          case 'CodeBlock': {
            let lp = node.from
            while (lp <= node.to) {
              const line = state.doc.lineAt(lp)
              decos.push(codeBlockLineDeco.range(line.from))
              lp = line.to + 1
            }
            return false
          }

          // ── Link / Image bracket delimiters ──────────────────
          case 'LinkMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── URL inside Link or Image ─────────────────────────
          case 'URL': {
            if (!parent) return
            if (parent.name !== 'Link' && parent.name !== 'Image') return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Link title (the "title" in [text](url "title")) ──
          case 'LinkTitle': {
            if (!parent) return
            if (parent.name !== 'Link' && parent.name !== 'Image') return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, node.to)
            return
          }

          // ── Blockquote marks: > + trailing space ─────────────
          case 'QuoteMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return
            hide(node.from, skipSpaces(state, node.to))
            return
          }

          // ── Horizontal rule → styled line widget ─────────────
          case 'HorizontalRule': {
            if (cursorWithin(state, node.from, node.to)) return
            decos.push(
              Decoration.replace({ widget: new HRWidget() }).range(node.from, node.to)
            )
            return
          }

          // ── List markers ─────────────────────────────────────
          case 'ListMark': {
            if (!parent) return
            if (cursorWithin(state, parent.from, parent.to)) return

            if (parent.name === 'ListItem' && listItemHasTask(parent)) {
              hide(node.from, skipSpaces(state, node.to))
              return
            }

            const grandparent = parent.parent
            if (grandparent?.name === 'BulletList') {
              const end = skipSpaces(state, node.to)
              decos.push(
                Decoration.replace({ widget: new BulletWidget() }).range(node.from, end)
              )
            }
            return
          }

          // ── Task checkbox: [ ] / [x] → checkbox widget ───────
          case 'TaskMarker': {
            if (!parent) return
            const listItem = parent.parent
            if (listItem && cursorWithin(state, listItem.from, listItem.to)) return
            const text = state.doc.sliceString(node.from, node.to)
            const checked = /[xX]/.test(text)
            const end = skipSpaces(state, node.to)
            decos.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked, node.from, node.to)
              }).range(node.from, end)
            )
            return
          }

          // ── Table delimiter row: hide the |---|---| line ──────
          case 'TableDelimiter': {
            if (cursorWithinTableAncestor(state, node.node)) return
            hide(node.from, node.to)
            return
          }
        }
      }
    })

    // ── Regex fallbacks for syntax not in the Lezer tree ──────────

    let pos = vr.from
    while (pos <= vr.to) {
      const line = state.doc.lineAt(pos)
      if (line.from > vr.to) break
      const text = line.text

      const wikiRe = /\[\[([^\]]+)\]\]/g
      let m: RegExpExecArray | null
      while ((m = wikiRe.exec(text)) !== null) {
        const start = line.from + m.index
        const end = start + m[0].length
        if (!cursorWithin(state, start, end)) {
          hide(start, start + 2)
          hide(end - 2, end)
        }
      }

      const hlRe = /==([^=]+?)==/g
      while ((m = hlRe.exec(text)) !== null) {
        const start = line.from + m.index
        const end = start + m[0].length
        if (!cursorWithin(state, start, end)) {
          hide(start, start + 2)
          hide(end - 2, end)
        }
      }

      pos = line.to + 1
    }
  }

  return Decoration.set(decos, true)
}

// ── ViewPlugin ───────────────────────────────────────────────────────

const markdownHideSyntaxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    lastLive: boolean

    constructor(view: EditorView) {
      this.lastLive = isLivePreviewMode()
      this.decorations = this.lastLive ? buildDecorations(view) : Decoration.none
    }

    update(update: ViewUpdate) {
      const live = isLivePreviewMode()
      const modeChanged = live !== this.lastLive
      this.lastLive = live
      if (!live) {
        this.decorations = Decoration.none
        return
      }
      const reconfigured = update.transactions.some((t) => t.reconfigured)
      if (modeChanged || update.docChanged || update.viewportChanged || update.selectionSet || reconfigured) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

// TreeHighlighter uses Prec.high (inner DOM). Lowest precedence = outer marks, so we only wrap
// delimiter tokens (**, ~~, etc.) and leave inner highlighted text visible.
export const markdownHideSyntax = [
  Prec.lowest(markdownHideSyntaxPlugin),
  Prec.lowest(mermaidField),
  Prec.lowest(tableLiveField)
]
