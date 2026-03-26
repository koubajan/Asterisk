export type ColumnAlignment = 'left' | 'center' | 'right' | 'default'

export interface TableData {
  headers: string[]
  alignments: ColumnAlignment[]
  rows: string[][]
}

const DELIMITER_CELL = /^:?-{1,}:?$/

function isDelimiterLine(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  let inner = t
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|')) inner = inner.slice(0, -1)
  const parts = inner.split('|').map((s) => s.trim())
  return parts.length > 0 && parts.every((p) => DELIMITER_CELL.test(p))
}

function isTableRowLine(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  return !isDelimiterLine(line)
}

export interface ExtractedTable {
  start: number
  end: number
  markdown: string
}

/** Find GFM-style markdown tables in document (header + delimiter + optional body). */
export function extractTables(content: string): ExtractedTable[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const lineStarts: number[] = []
  let pos = 0
  for (const line of lines) {
    lineStarts.push(pos)
    pos += line.length + 1
  }

  const results: ExtractedTable[] = []
  let inFence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      inFence = !inFence
      i++
      continue
    }
    if (inFence) {
      i++
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    if (i + 1 < lines.length && isTableRowLine(line) && isDelimiterLine(lines[i + 1])) {
      const start = lineStarts[i]
      let j = i + 2
      while (j < lines.length) {
        const L = lines[j]
        if (!L.trim()) break
        if (isDelimiterLine(L)) {
          j++
          continue
        }
        if (!isTableRowLine(L)) break
        j++
      }
      const last = j - 1
      const end = lineStarts[last] + lines[last].length
      const markdown = normalized.slice(start, end)
      results.push({ start, end, markdown })
      i = j
    } else {
      i++
    }
  }
  return results
}

export function replaceTableByIndex(content: string, tableIndex: number, newMarkdown: string): string {
  const tables = extractTables(content.replace(/\r\n/g, '\n'))
  const t = tables[tableIndex]
  if (!t) return content
  const norm = content.replace(/\r\n/g, '\n')
  return norm.slice(0, t.start) + newMarkdown + norm.slice(t.end)
}

export function splitTableRow(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function parseAlignmentToken(token: string): ColumnAlignment {
  const s = token.trim()
  if (s.startsWith(':') && s.endsWith(':') && s.length > 2) return 'center'
  if (s.endsWith(':')) return 'right'
  if (s.startsWith(':')) return 'left'
  return 'default'
}

function alignmentToSep(a: ColumnAlignment): string {
  switch (a) {
    case 'left':
      return ':---'
    case 'right':
      return '---:'
    case 'center':
      return ':---:'
    default:
      return '---'
  }
}

export function parseMarkdownTable(markdown: string): TableData | null {
  const raw = markdown.replace(/\r\n/g, '\n').trim()
  const lines = raw.split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) return null
  if (!isDelimiterLine(lines[1])) return null

  const headers = splitTableRow(lines[0])
  const alignParts = splitTableRow(lines[1])
  let colCount = Math.max(headers.length, alignParts.length, 1)

  const alignments: ColumnAlignment[] = alignParts.map(parseAlignmentToken)
  while (alignments.length < colCount) alignments.push('default')
  while (headers.length < colCount) headers.push('')
  if (headers.length > colCount) headers.splice(colCount)
  if (alignments.length > colCount) alignments.splice(colCount)

  const rows: string[][] = []
  for (let r = 2; r < lines.length; r++) {
    if (isDelimiterLine(lines[r])) continue
    const cells = splitTableRow(lines[r])
    colCount = Math.max(colCount, cells.length)
    while (cells.length < colCount) cells.push('')
    rows.push(cells.slice(0, colCount))
  }

  while (headers.length < colCount) headers.push('')
  while (alignments.length < colCount) alignments.push('default')
  for (const row of rows) {
    while (row.length < colCount) row.push('')
    if (row.length > colCount) row.splice(colCount)
  }

  return {
    headers: headers.slice(0, colCount),
    alignments: alignments.slice(0, colCount),
    rows
  }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

export function tableToMarkdown(data: TableData): string {
  const fmt = (cells: string[]) =>
    '| ' + cells.map((c) => escapeCell(c)).join(' | ') + ' |'
  const sep = '| ' + data.alignments.map(alignmentToSep).join(' | ') + ' |'
  const lines = [fmt(data.headers), sep, ...data.rows.map((r) => fmt(r))]
  return lines.join('\n')
}

export function addTableRow(data: TableData, atIndex: number): TableData {
  const colCount = Math.max(data.headers.length, 1)
  const newRow = Array(colCount).fill('')
  const rows = [...data.rows]
  rows.splice(atIndex, 0, newRow)
  return { ...data, rows }
}

export function deleteTableRow(data: TableData, index: number): TableData {
  if (data.rows.length <= 1) return data
  const rows = data.rows.filter((_, i) => i !== index)
  return { ...data, rows }
}

export function addTableColumn(data: TableData, atIndex: number): TableData {
  const headers = [...data.headers]
  headers.splice(atIndex, 0, '')
  const alignments = [...data.alignments]
  alignments.splice(atIndex, 0, 'default' as ColumnAlignment)
  const rows = data.rows.map((row) => {
    const next = [...row]
    next.splice(atIndex, 0, '')
    return next
  })
  return { headers, alignments, rows }
}

export function deleteTableColumn(data: TableData, index: number): TableData {
  if (data.headers.length <= 1) return data
  const headers = data.headers.filter((_, i) => i !== index)
  const alignments = data.alignments.filter((_, i) => i !== index)
  const rows = data.rows.map((row) => row.filter((_, i) => i !== index))
  return { headers, alignments, rows }
}
