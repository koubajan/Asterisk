import type { ColumnAlignment, TableData } from './markdownTableCore'
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  parseMarkdownTable,
  tableToMarkdown
} from './markdownTableCore'

function readTableFromDom(root: HTMLElement | null): TableData | null {
  if (!root) return null
  const table = root.querySelector('table.preview-editable-table')
  if (!table) return null
  const headerCells = table.querySelectorAll('thead tr th:not(.preview-editable-corner) .preview-editable-cell')
  const headers: string[] = []
  headerCells.forEach((el) => headers.push(el.textContent ?? ''))
  const alignments: ColumnAlignment[] = []
  const thEls = table.querySelectorAll('thead tr th:not(.preview-editable-corner)')
  thEls.forEach((th) => {
    const a = (th as HTMLElement).dataset.align as ColumnAlignment | undefined
    alignments.push(a && ['left', 'center', 'right', 'default'].includes(a) ? a : 'default')
  })
  const bodyRows = table.querySelectorAll('tbody tr')
  const rows: string[][] = []
  bodyRows.forEach((tr) => {
    const cells = tr.querySelectorAll('td:not(.preview-editable-row-gutter) .preview-editable-cell')
    const row: string[] = []
    cells.forEach((el) => row.push(el.textContent ?? ''))
    rows.push(row)
  })
  const colCount = Math.max(headers.length, 1, ...rows.map((r) => r.length))
  while (headers.length < colCount) headers.push('')
  while (alignments.length < colCount) alignments.push('default')
  rows.forEach((row) => {
    while (row.length < colCount) row.push('')
  })
  return { headers, alignments, rows }
}

export interface MountPreviewEditableTableOptions {
  markdown: string
  onChange: (markdown: string) => void
}

export interface MountedPreviewEditableTable {
  destroy: () => void
}

function focusCellInWrap(root: HTMLElement, row: 'head' | number, col: number): void {
  const sel =
    row === 'head'
      ? `thead th:nth-child(${col + 2}) .preview-editable-cell`
      : `tbody tr:nth-child(${row + 1}) td:nth-child(${col + 2}) .preview-editable-cell`
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) return
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const s = window.getSelection()
  s?.removeAllRanges()
  s?.addRange(range)
}

/** Build editable table DOM inside `wrap` (cleared first). */
export function mountPreviewEditableTable(
  wrap: HTMLElement,
  options: MountPreviewEditableTableOptions
): MountedPreviewEditableTable {
  wrap.className = 'preview-editable-table-wrap'
  wrap.innerHTML = ''

  const data = parseMarkdownTable(options.markdown)
  if (!data) {
    const err = document.createElement('div')
    err.className = 'preview-editable-table-error'
    err.setAttribute('role', 'note')
    err.textContent = 'Invalid table markdown'
    wrap.appendChild(err)
    return {
      destroy() {
        wrap.innerHTML = ''
      }
    }
  }

  let disposed = false

  const commit = () => {
    if (disposed) return
    const next = readTableFromDom(wrap)
    if (!next) return
    options.onChange(tableToMarkdown(next))
  }

  const applyStructural = (mutate: (d: TableData) => TableData) => {
    if (disposed) return
    const base = readTableFromDom(wrap) ?? parseMarkdownTable(options.markdown)
    if (!base) return
    options.onChange(tableToMarkdown(mutate(base)))
  }

  const onPaste = (e: ClipboardEvent) => {
    const t = e.target as HTMLElement
    if (!t.classList.contains('preview-editable-cell')) return
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    document.execCommand('insertText', false, text.replace(/\r\n/g, '\n'))
  }
  wrap.addEventListener('paste', onPaste)

  const toolbar = document.createElement('div')
  toolbar.className = 'preview-editable-table-toolbar'

  const btnCol = document.createElement('button')
  btnCol.type = 'button'
  btnCol.className = 'preview-editable-table-edge-btn'
  btnCol.title = 'Add column at end'
  btnCol.setAttribute('aria-label', 'Add column at end')
  btnCol.textContent = '+ Col'
  btnCol.addEventListener('click', () => applyStructural((d) => addTableColumn(d, d.headers.length)))

  const btnRow = document.createElement('button')
  btnRow.type = 'button'
  btnRow.className = 'preview-editable-table-edge-btn'
  btnRow.title = 'Add row at end'
  btnRow.setAttribute('aria-label', 'Add row at end')
  btnRow.textContent = '+ Row'
  btnRow.addEventListener('click', () => applyStructural((d) => addTableRow(d, d.rows.length)))

  toolbar.append(btnCol, btnRow)
  wrap.appendChild(toolbar)

  const colCount = data.headers.length
  const rowCount = data.rows.length

  const bindKeydown = (el: HTMLElement, row: 'head' | number, col: number) => {
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        applyStructural((d) => addTableColumn(d, col + 1))
        return
      }
      if (meta && e.key === 'Enter') {
        e.preventDefault()
        const bodyIndex = row === 'head' ? 0 : row + 1
        applyStructural((d) => addTableRow(d, bodyIndex))
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (row === 'head') {
          if (rowCount === 0) {
            applyStructural((d) => addTableRow(d, 0))
            requestAnimationFrame(() => focusCellInWrap(wrap, 0, col))
          } else {
            focusCellInWrap(wrap, 0, col)
          }
        } else if (row < rowCount - 1) {
          focusCellInWrap(wrap, row + 1, col)
        } else {
          applyStructural((d) => addTableRow(d, d.rows.length))
          requestAnimationFrame(() => focusCellInWrap(wrap, rowCount, col))
        }
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const nextCol = e.shiftKey ? col - 1 : col + 1
        if (nextCol >= 0 && nextCol < colCount) {
          if (row === 'head') focusCellInWrap(wrap, 'head', nextCol)
          else focusCellInWrap(wrap, row, nextCol)
        } else if (!e.shiftKey && nextCol >= colCount) {
          if (row === 'head') focusCellInWrap(wrap, 0, 0)
          else if (row < rowCount - 1) focusCellInWrap(wrap, row + 1, 0)
          else {
            applyStructural((d) => addTableRow(d, d.rows.length))
            requestAnimationFrame(() => focusCellInWrap(wrap, rowCount, 0))
          }
        } else if (e.shiftKey && nextCol < 0) {
          if (row === 'head') return
          if (row > 0) focusCellInWrap(wrap, row - 1, colCount - 1)
          else focusCellInWrap(wrap, 'head', colCount - 1)
        }
      }
    })
  }

  const table = document.createElement('table')
  table.className = 'preview-editable-table'

  const thead = document.createElement('thead')
  const headTr = document.createElement('tr')

  const corner = document.createElement('th')
  corner.className = 'preview-editable-corner'
  corner.setAttribute('aria-hidden', 'true')
  headTr.appendChild(corner)

  data.headers.forEach((h, ci) => {
    const th = document.createElement('th')
    th.dataset.align = data.alignments[ci] ?? 'default'

    const colControls = document.createElement('div')
    colControls.className = 'preview-editable-col-controls'
    colControls.setAttribute('role', 'group')
    colControls.setAttribute('aria-label', `Column ${ci + 1} actions`)

    const b1 = document.createElement('button')
    b1.type = 'button'
    b1.className = 'preview-editable-mini-btn'
    b1.title = 'Add column left'
    b1.setAttribute('aria-label', 'Add column left')
    b1.textContent = '◀+'
    b1.addEventListener('click', () => applyStructural((d) => addTableColumn(d, ci)))

    const b2 = document.createElement('button')
    b2.type = 'button'
    b2.className = 'preview-editable-mini-btn'
    b2.title = 'Add column right'
    b2.setAttribute('aria-label', 'Add column right')
    b2.textContent = '+▶'
    b2.addEventListener('click', () => applyStructural((d) => addTableColumn(d, ci + 1)))

    const b3 = document.createElement('button')
    b3.type = 'button'
    b3.className = 'preview-editable-mini-btn preview-editable-mini-btn-danger'
    b3.title = 'Delete column'
    b3.setAttribute('aria-label', 'Delete column')
    b3.textContent = '×'
    b3.disabled = colCount <= 1
    b3.addEventListener('click', () => applyStructural((d) => deleteTableColumn(d, ci)))

    colControls.append(b1, b2, b3)
    th.appendChild(colControls)

    const cell = document.createElement('div')
    cell.className = 'preview-editable-cell'
    cell.contentEditable = 'true'
    cell.textContent = h
    cell.addEventListener('blur', commit)
    bindKeydown(cell, 'head', ci)
    th.appendChild(cell)
    headTr.appendChild(th)
  })

  thead.appendChild(headTr)

  const tbody = document.createElement('tbody')
  data.rows.forEach((row, ri) => {
    const tr = document.createElement('tr')

    const gutter = document.createElement('td')
    gutter.className = 'preview-editable-row-gutter'
    const rowControls = document.createElement('div')
    rowControls.className = 'preview-editable-row-controls'
    rowControls.setAttribute('role', 'group')
    rowControls.setAttribute('aria-label', `Row ${ri + 1} actions`)

    const r1 = document.createElement('button')
    r1.type = 'button'
    r1.className = 'preview-editable-mini-btn'
    r1.title = 'Add row above'
    r1.setAttribute('aria-label', 'Add row above')
    r1.textContent = '↑+'
    r1.addEventListener('click', () => applyStructural((d) => addTableRow(d, ri)))

    const r2 = document.createElement('button')
    r2.type = 'button'
    r2.className = 'preview-editable-mini-btn'
    r2.title = 'Add row below'
    r2.setAttribute('aria-label', 'Add row below')
    r2.textContent = '+↓'
    r2.addEventListener('click', () => applyStructural((d) => addTableRow(d, ri + 1)))

    const r3 = document.createElement('button')
    r3.type = 'button'
    r3.className = 'preview-editable-mini-btn preview-editable-mini-btn-danger'
    r3.title = 'Delete row'
    r3.setAttribute('aria-label', 'Delete row')
    r3.textContent = '×'
    r3.disabled = rowCount <= 1
    r3.addEventListener('click', () => applyStructural((d) => deleteTableRow(d, ri)))

    rowControls.append(r1, r2, r3)
    gutter.appendChild(rowControls)
    tr.appendChild(gutter)

    row.forEach((cellText, ci) => {
      const td = document.createElement('td')
      const cell = document.createElement('div')
      cell.className = 'preview-editable-cell'
      cell.contentEditable = 'true'
      cell.textContent = cellText
      cell.addEventListener('blur', commit)
      bindKeydown(cell, ri, ci)
      td.appendChild(cell)
      tr.appendChild(td)
    })

    tbody.appendChild(tr)
  })

  table.append(thead, tbody)
  wrap.appendChild(table)

  return {
    destroy() {
      disposed = true
      wrap.removeEventListener('paste', onPaste)
      wrap.innerHTML = ''
    }
  }
}
