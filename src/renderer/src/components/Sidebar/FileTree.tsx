import { useState, useRef } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, File, LayoutGrid, PenLine } from 'lucide-react'
import type { FolderNode } from '../../types'
import { useWorkspace } from '../../store/useWorkspace'
import { useFileOps } from '../../hooks/useFileOps'
import ContextMenu from './ContextMenu'

function getRelativePath(fromFile: string | null, toPath: string): string {
  if (!fromFile) return toPath
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
  
  const fromParts = fromDir.split('/').filter(Boolean)
  const toParts = toPath.split('/').filter(Boolean)
  
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  
  const ups = fromParts.length - common
  const downs = toParts.slice(common).join('/')
  
  if (ups === 0) return './' + downs
  return '../'.repeat(ups) + downs
}

interface FileTreeProps {
  nodes: FolderNode[]
  rootPath: string
  onNewFile: (dirPath: string) => void
  onNewFolder: (dirPath: string) => void
  onNewCanvas?: (dirPath: string) => void
  onNewExcalidraw?: (dirPath: string) => void
}

interface ContextMenuState {
  node: FolderNode | null
  x: number
  y: number
}

const TREE_DRAG_TYPE = 'application/x-asterisk-tree-path'

export default function FileTree({ nodes, rootPath, onNewFile, onNewFolder, onNewCanvas, onNewExcalidraw }: FileTreeProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dropTarget, setDropTarget] = useState<{ path: string; isFolder: boolean } | null>(null)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const openFileNode = useWorkspace((s) => s.openFileNode)
  const { deleteItem, renameItem, moveItem } = useFileOps()

  function startRename(node: FolderNode) {
    setRenamingPath(node.path)
    setRenameValue(node.name)
    setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 50)
  }

  async function commitRename(node: FolderNode) {
    const newName = renameValue.trim()
    if (!newName || newName === node.name) {
      setRenamingPath(null)
      return
    }
    setRenamingPath(null)
    await renameItem(node.path, newName)
  }

  function handleEmptyContextMenu(e: React.MouseEvent) {
    // Only trigger if right-clicking on the tree container itself, not a node
    if ((e.target as HTMLElement).closest('.tree-node')) return
    e.preventDefault()
    setContextMenu({ node: null, x: e.clientX, y: e.clientY })
  }

  return (
    <div
      onContextMenu={handleEmptyContextMenu}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
      }}
      onDragEnd={() => {
        setDropTarget(null)
        setDraggedPath(null)
      }}
      style={{ minHeight: '100%' }}
    >
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          openFilePath={openFile?.path ?? null}
          renamingPath={renamingPath}
          renameValue={renameValue}
          renameInputRef={renameInputRef}
          dropTarget={dropTarget}
          draggedPath={draggedPath}
          onOpen={openFileNode}
          onContextMenu={(n, x, y) => setContextMenu({ node: n, x, y })}
          onStartRename={startRename}
          onRenameChange={setRenameValue}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenamingPath(null)}
          onDragStart={(path) => {
            setDropTarget(null)
            setDraggedPath(path)
          }}
          onDropTarget={setDropTarget}
          onDrop={async (fromPath, toDirPath) => {
            setDropTarget(null)
            setDraggedPath(null)
            await moveItem(fromPath, toDirPath)
          }}
        />
      ))}
      {contextMenu && (
        <ContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          rootPath={rootPath}
          onClose={() => setContextMenu(null)}
          onRename={contextMenu.node ? () => startRename(contextMenu.node!) : undefined}
          onDelete={contextMenu.node ? () => deleteItem(contextMenu.node!.path) : undefined}
          onToggleTag={contextMenu.node ? (tagId) => useWorkspace.getState().toggleFileTag(contextMenu.node!.path, tagId) : undefined}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onNewCanvas={onNewCanvas}
          onNewExcalidraw={onNewExcalidraw}
        />
      )}
    </div>
  )
}

interface TreeNodeProps {
  node: FolderNode
  openFilePath: string | null
  renamingPath: string | null
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement>
  dropTarget: { path: string; isFolder: boolean } | null
  draggedPath: string | null
  onOpen: (node: FolderNode) => void
  onContextMenu: (node: FolderNode, x: number, y: number) => void
  onStartRename: (node: FolderNode) => void
  onRenameChange: (v: string) => void
  onRenameCommit: (node: FolderNode) => void
  onRenameCancel: () => void
  onDragStart: (path: string) => void
  onDropTarget: (target: { path: string; isFolder: boolean } | null) => void
  onDrop: (fromPath: string, toDirPath: string) => Promise<void>
}

function getParentPath(nodePath: string): string {
  const sep = nodePath.includes('\\') ? '\\' : '/'
  const last = nodePath.lastIndexOf(sep)
  return last <= 0 ? '' : nodePath.slice(0, last)
}

function pathIsInside(parentPath: string, childPath: string): boolean {
  if (!parentPath || parentPath === childPath) return false
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '')
  const p = norm(parentPath)
  const c = norm(childPath)
  return c === p || c.startsWith(p + '/')
}

function TreeNode(props: TreeNodeProps) {
  const {
    node, openFilePath, renamingPath, renameValue, renameInputRef, dropTarget, draggedPath,
    onOpen, onContextMenu, onStartRename, onRenameChange, onRenameCommit, onRenameCancel,
    onDragStart, onDropTarget, onDrop
  } = props

  const [open, setOpen] = useState(true)
  const isFolder = node.kind === 'folder'
  const isActive = node.path === openFilePath
  const isRenaming = node.path === renamingPath
  const parentPath = getParentPath(node.path)
  const targetDirPath = isFolder ? node.path : parentPath
  const isDropTarget = dropTarget?.path === node.path

  // Indentation: 12px base + 16px per depth level
  const paddingLeft = 12 + node.depth * 16

  function handleClick() {
    if (isFolder) setOpen((o) => !o)
    else onOpen(node)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(node, e.clientX, e.clientY)
  }

  function handleDragStart(e: React.DragEvent) {
    const relPath = getRelativePath(openFilePath, node.path)
    e.dataTransfer.setData('text/plain', `[${node.name}](${relPath})`)
    e.dataTransfer.setData(TREE_DRAG_TYPE, node.path)
    e.dataTransfer.effectAllowed = 'copyMove'
    onDragStart(node.path)
  }

  function handleDragOver(e: React.DragEvent) {
    const fromPath = e.dataTransfer.getData(TREE_DRAG_TYPE) || draggedPath
    if (!fromPath) return
    if (fromPath === node.path) return
    if (isFolder && pathIsInside(fromPath, node.path)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    onDropTarget({ path: node.path, isFolder })
  }

  function handleDragLeave(e: React.DragEvent) {
    const related = e.relatedTarget as Node | null
    if (related != null && e.currentTarget.contains(related)) return
    onDropTarget(null)
  }

  async function handleDrop(e: React.DragEvent) {
    const fromPath = e.dataTransfer.getData(TREE_DRAG_TYPE) || draggedPath
    if (!fromPath || !targetDirPath) return
    e.preventDefault()
    e.stopPropagation()
    if (fromPath === targetDirPath) return
    if (pathIsInside(fromPath, targetDirPath)) return
    await onDrop(fromPath, targetDirPath)
  }

  // Split filename into base + extension for styling
  const name = node.name
  const dotIdx = isFolder ? -1 : name.lastIndexOf('.')
  const nameBase = dotIdx > 0 ? name.slice(0, dotIdx) : name
  const nameExt = dotIdx > 0 ? name.slice(dotIdx) : ''

  const extColor = nameExt ? 'var(--text-muted)' : 'inherit'

  // Fetch tags for this node
  const fileTags = useWorkspace((s) => s.fileTags)
  const customTags = useWorkspace((s) => s.customTags)
  const nodeTagIds = fileTags[node.path] ?? []
  const nodeTags = nodeTagIds.map(id => customTags.find(t => t.id === id)).filter(Boolean) as typeof customTags
  const tagColor = nodeTags[0]?.color

  return (
    <>
      <div
        className={`tree-node${isActive ? ' active' : ''}${isDropTarget ? ' tree-node-drop-target' : ''}${isFolder && node.name === 'Artifacts' ? ' tree-node-artifacts-folder' : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Indent Guides (Branching) */}
        {node.depth > 0 && Array.from({ length: node.depth }).map((_, i) => {
          const isLast = i === node.depth - 1
          return (
            <div
              key={i}
              className={`tree-guide${isLast ? ' l-shape' : ''}`}
              style={{ left: 16 + i * 16 }}
            />
          )
        })}

        {/* Chevron or spacer */}
        <span className={`tree-chevron${isFolder ? (open ? ' open' : '') : ' hidden'}`}>
          <ChevronRight size={10} strokeWidth={2} />
        </span>

        {/* File / folder icon */}
        <span className="tree-icon" style={tagColor ? { color: tagColor } : undefined}>
          {isFolder
            ? (node.name === 'Artifacts'
                ? <LayoutGrid size={14} strokeWidth={1.4} />
                : node.name === 'Excalidraw'
                ? <PenLine size={14} strokeWidth={1.4} />
                : (open
                    ? <FolderOpen size={14} strokeWidth={1.4} />
                    : <Folder size={14} strokeWidth={1.4} />))
            : (nameExt === '.artifact'
                ? <LayoutGrid size={14} strokeWidth={1.4} />
                : nameExt === '.excalidraw'
                ? <PenLine size={14} strokeWidth={1.4} />
                : nameExt === '.md' || nameExt === '.markdown'
                ? <FileText size={14} strokeWidth={1.4} />
                : <File size={14} strokeWidth={1.4} />)
          }
        </span>

        {/* Name — or rename input */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="tree-rename-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit(node)
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={() => onRenameCommit(node)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label">
            <span className={`tree-name${isFolder ? ' folder' : ''}`} style={tagColor ? { color: tagColor } : undefined}>{nameBase}</span>
            {nameExt && <span className="tree-ext">{nameExt}</span>}
            {nodeTags.map(tag => (
              <div key={tag.id} className="tree-tag-dot" style={{ backgroundColor: tag.color }} />
            ))}
          </span>
        )}
      </div>

      {/* Children without indent guide pseudoelement (now using individual guides) */}
      {isFolder && open && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              openFilePath={openFilePath}
              renamingPath={renamingPath}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              dropTarget={dropTarget}
              draggedPath={draggedPath}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onStartRename={onStartRename}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDragStart={onDragStart}
              onDropTarget={onDropTarget}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </>
  )
}
