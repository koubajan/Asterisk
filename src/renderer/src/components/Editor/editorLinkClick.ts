import { EditorView } from '@codemirror/view'
import { useWorkspace } from '../../store/useWorkspace'
import type { FolderNode } from '../../types'

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g
const WIKI_LINK = /\[\[([^\]]+)\]\]/g

function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:')
}

function isFileLink(href: string): boolean {
  return href.endsWith('.md') || href.endsWith('.markdown') || href.endsWith('.txt')
}

function getBaseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function findFileNodeByNoteName(nodes: FolderNode[], noteName: string): FolderNode | null {
  const normalized = noteName.trim().toLowerCase()
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (getBaseName(node.name).toLowerCase() === normalized) return node
    }
    if (node.children?.length) {
      const found = findFileNodeByNoteName(node.children, noteName)
      if (found) return found
    }
  }
  return null
}

function findLinkAtPos(doc: string, pos: number): { label: string; href: string; from: number; to: number } | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = doc.indexOf('\n', pos)
  const lineEndPos = lineEnd === -1 ? doc.length : lineEnd
  const line = doc.slice(lineStart, lineEndPos)
  MARKDOWN_LINK.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKDOWN_LINK.exec(line)) !== null) {
    const from = lineStart + m.index
    const to = lineStart + m.index + m[0].length
    if (pos >= from && pos <= to) {
      return { label: m[1], href: m[2].trim(), from, to }
    }
  }
  return null
}

function findWikiLinkAtPos(doc: string, pos: number): { noteName: string; from: number; to: number } | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = doc.indexOf('\n', pos)
  const lineEndPos = lineEnd === -1 ? doc.length : lineEnd
  const line = doc.slice(lineStart, lineEndPos)
  WIKI_LINK.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_LINK.exec(line)) !== null) {
    const from = lineStart + m.index
    const to = lineStart + m.index + m[0].length
    if (pos >= from && pos <= to) {
      return { noteName: m[1].trim(), from, to }
    }
  }
  return null
}

export function editorLinkClick(getCurrentFilePath: () => string | null) {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!event.metaKey && !event.ctrlKey) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return false
      const doc = view.state.doc.toString()

      const link = findLinkAtPos(doc, pos)
      if (link) {
        const href = link.href
        if (isWebUrl(href)) {
          window.open(href, '_blank')
          return true
        }
        if (isFileLink(href)) {
          const currentPath = getCurrentFilePath()
          if (!currentPath) return true
          const dir = currentPath.substring(0, currentPath.lastIndexOf('/'))
          const resolvedPath = href.startsWith('/')
            ? href
            : dir + '/' + href.replace(/^\.\//, '')
          window.asterisk.readFile(resolvedPath).then((result) => {
            if (result.ok && result.data) {
              const fileName = resolvedPath.split('/').pop() ?? resolvedPath
              const { openFileNode } = useWorkspace.getState()
              openFileNode({
                kind: 'file',
                name: fileName,
                path: resolvedPath,
                children: [],
                depth: 0
              })
            }
          })
          return true
        }
        return true
      }

      const wikiLink = findWikiLinkAtPos(doc, pos)
      if (wikiLink) {
        const { tree, openFileNode } = useWorkspace.getState()
        const node = findFileNodeByNoteName(tree, wikiLink.noteName)
        if (node) openFileNode(node)
        return true
      }

      return false
    }
  })
}
