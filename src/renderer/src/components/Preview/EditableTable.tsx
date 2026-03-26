import { useEffect, useRef } from 'react'
import { mountPreviewEditableTable } from './createEditableTableDom'

export type { ColumnAlignment, TableData, ExtractedTable } from './markdownTableCore'
export {
  extractTables,
  replaceTableByIndex,
  splitTableRow,
  parseMarkdownTable,
  tableToMarkdown,
  addTableRow,
  addTableColumn,
  deleteTableRow,
  deleteTableColumn
} from './markdownTableCore'

export interface EditableTableProps {
  markdown: string
  tableIndex: number
  onTableChange: (tableIndex: number, newMarkdown: string) => void
}

export default function EditableTable({ markdown, tableIndex, onTableChange }: EditableTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const onTableChangeRef = useRef(onTableChange)
  onTableChangeRef.current = onTableChange

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const mounted = mountPreviewEditableTable(wrap, {
      markdown,
      onChange: (md) => onTableChangeRef.current(tableIndex, md)
    })
    return () => mounted.destroy()
  }, [markdown, tableIndex])

  return <div ref={wrapRef} />
}
