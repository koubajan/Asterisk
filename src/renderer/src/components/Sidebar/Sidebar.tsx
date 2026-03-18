import { useState, useMemo, useEffect, useRef } from 'react'
import { FolderOpen, FilePlus, FolderPlus, RotateCw, X, Check, GitBranch, List, Star, LayoutGrid, PenLine, Calendar as CalendarIcon } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import { useFileOps } from '../../hooks/useFileOps'
import FileTree from './FileTree'
import NeuralGraph from '../NeuralGraph/NeuralGraph'
import CalendarPanel from '../Calendar/Calendar'
import FilterBar, { type SortBy, type SortDir } from './FilterBar'
import type { FolderNode } from '../../types'
import './Sidebar.css'

function filterTree(
  nodes: FolderNode[],
  query: string,
  sortBy: SortBy,
  sortDir: SortDir,
  selectedTagIds: string[],
  fileTags: Record<string, string[]>
): FolderNode[] {
  const q = query.toLowerCase()
  const result: FolderNode[] = []

  for (const node of nodes) {
    if (node.kind === 'file') {
      const matchesQuery = !q || node.name.toLowerCase().includes(q)
      const matchesTags = selectedTagIds.length === 0 ||
        selectedTagIds.some(id => (fileTags[node.path] ?? []).includes(id))
      if (matchesQuery && matchesTags) result.push(node)
    } else {
      const filteredChildren = filterTree(node.children, query, sortBy, sortDir, selectedTagIds, fileTags)
      if (filteredChildren.length > 0 || (!q || node.name.toLowerCase().includes(q))) {
        result.push({ ...node, children: filteredChildren })
      }
    }
  }

  return result.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'mtime') return ((a.mtime ?? 0) - (b.mtime ?? 0)) * dir
    return a.name.localeCompare(b.name) * dir
  })
}

interface CreateTarget {
  type: 'file' | 'folder' | 'canvas' | 'excalidraw'
  dirPath: string
}

export default function Sidebar() {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const setActiveWorkspace = useWorkspace((s) => s.setActiveWorkspace)
  const removeWorkspace = useWorkspace((s) => s.removeWorkspace)

  const activeWorkspace = workspaces[activeWorkspaceIndex]
  const folderPath = activeWorkspace?.path ?? ''

  const tree = useWorkspace((s) => s.tree)
  const setTree = useWorkspace((s) => s.setTree)
  const { openFolder, refreshTree } = useFileOps()
  const fileTags = useWorkspace((s) => s.fileTags)
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const openFileNode = useWorkspace((s) => s.openFileNode)
  const setError = useWorkspace((s) => s.setError)

  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // Inline creation state
  const [creating, setCreating] = useState<CreateTarget | null>(null)
  const [createName, setCreateName] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<'tree' | 'graph' | 'bookmarks' | 'calendar'>('tree')

  // ── Content search (search inside files) ────────────────────────────────────
  const [contentMatches, setContentMatches] = useState<{ path: string; snippets: string[] }[]>([])
  const [contentSearchLoading, setContentSearchLoading] = useState(false)
  const contentSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!folderPath || !query.trim()) {
      setContentMatches([])
      return
    }
    if (contentSearchRef.current) clearTimeout(contentSearchRef.current)
    contentSearchRef.current = setTimeout(async () => {
      setContentSearchLoading(true)
      const result = await window.asterisk.searchContent(folderPath, query.trim())
      setContentSearchLoading(false)
      contentSearchRef.current = null
      if (result.ok && result.data) setContentMatches(result.data.matches)
      else setContentMatches([])
    }, 300)
    return () => {
      if (contentSearchRef.current) clearTimeout(contentSearchRef.current)
    }
  }, [folderPath, query])

  // ── Sidebar resize ─────────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    resizeDragRef.current = { startX: e.clientX, startWidth: sidebarWidth }

    function onMove(ev: MouseEvent) {
      if (!resizeDragRef.current) return
      const delta = ev.clientX - resizeDragRef.current.startX
      setSidebarWidth(Math.max(180, Math.min(600, resizeDragRef.current.startWidth + delta)))
    }
    function onUp() {
      resizeDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const folderName = activeWorkspace?.name ?? 'Folders'
  const filteredTree = useMemo(
    () => filterTree(tree, query.trim(), sortBy, sortDir, selectedTagIds, fileTags),
    [tree, query, sortBy, sortDir, selectedTagIds, fileTags]
  )

  function handleTagToggle(id: string) {
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function handleClearAll() {
    setQuery('')
    setSelectedTagIds([])
  }

  // Hydrate empty tree when changing workspace or mounting
  useEffect(() => {
    if (folderPath && tree.length === 0) {
      refreshTree()
    }
  }, [folderPath, activeWorkspaceIndex])

  useEffect(() => {
    if (creating) {
      setTimeout(() => createInputRef.current?.focus(), 50)
    }
  }, [creating])

  async function handleRefresh() {
    if (!folderPath) return
    const result = await window.asterisk.listDir(folderPath)
    if (result.ok && result.data) setTree(result.data.nodes)
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!creating || !createName.trim()) return
    const name = createName.trim()

    if (creating.type === 'file') {
      const result = await window.asterisk.createFile(creating.dirPath, name)
      if (result.ok) {
        setError(null)
        await handleRefresh()
        if (result.data?.node) {
          const openFileNode = useWorkspace.getState().openFileNode
          await openFileNode(result.data.node)
        }
        setCreating(null)
        setCreateName('')
      } else {
        setError(result.error ?? 'Failed to create file')
      }
    } else if (creating.type === 'folder') {
      const result = await window.asterisk.createFolder(creating.dirPath, name)
      if (result.ok) {
        setError(null)
        await handleRefresh()
        setCreating(null)
        setCreateName('')
      } else {
        setError(result.error ?? 'Failed to create folder')
      }
    } else if (creating.type === 'canvas') {
      const result = await window.asterisk.createCanvas(folderPath, name)
      if (result.ok) {
        setError(null)
        await handleRefresh()
        if (result.data?.node) {
          const openFileNode = useWorkspace.getState().openFileNode
          await openFileNode(result.data.node)
        }
        setCreating(null)
        setCreateName('')
      } else {
        setError(result.error ?? 'Failed to create artifact')
      }
    } else if (creating.type === 'excalidraw') {
      const result = await window.asterisk.createExcalidraw(folderPath, name)
      if (result.ok) {
        setError(null)
        await handleRefresh()
        if (result.data?.node) {
          const openFileNode = useWorkspace.getState().openFileNode
          await openFileNode(result.data.node)
        }
        setCreating(null)
        setCreateName('')
      } else {
        setError(result.error ?? 'Failed to create Excalidraw drawing')
      }
    }
  }

  function cancelCreate() {
    setCreating(null)
    setCreateName('')
  }

  function handleNewFile(dirPath: string) {
    setCreating({ type: 'file', dirPath })
    setCreateName('')
  }

  function handleNewFolder(dirPath: string) {
    setCreating({ type: 'folder', dirPath })
    setCreateName('')
  }

  function handleNewCanvas(dirPath: string) {
    setCreating({ type: 'canvas', dirPath })
    setCreateName('')
  }

  function handleNewExcalidraw(dirPath: string) {
    setCreating({ type: 'excalidraw', dirPath })
    setCreateName('')
  }

  if (!folderPath) {
    return (
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-empty">
          <div className="sidebar-empty-icon">
            <FolderOpen size={40} strokeWidth={0.9} />
          </div>
          <p>No folder open.<br/>Select a folder to begin.</p>
          <button className="sidebar-open-btn" onClick={openFolder}>
            Open Folder
          </button>
        </div>
        <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
      </aside>
    )
  }

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      {workspaces.length > 1 && (
        <div className="sidebar-tabs">
          {workspaces.map((ws, i) => (
            <div 
              key={ws.path} 
              className={`sidebar-tab ${i === activeWorkspaceIndex ? 'active' : ''}`}
              onClick={() => setActiveWorkspace(i)}
            >
              <span className="sidebar-tab-name">{ws.name}</span>
              <button
                className="sidebar-tab-close"
                title={`Close ${ws.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeWorkspace(i)
                }}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-header">
        {view === 'tree' && (
          <>
            <button className="sidebar-icon-btn" title="New File" onClick={() => handleNewFile(folderPath)}>
              <FilePlus size={14} strokeWidth={1.7} />
            </button>
            <button className="sidebar-icon-btn" title="New Folder" onClick={() => handleNewFolder(folderPath)}>
              <FolderPlus size={14} strokeWidth={1.7} />
            </button>
            <button className="sidebar-icon-btn" title="New Artifact" onClick={() => handleNewCanvas(folderPath)}>
              <LayoutGrid size={14} strokeWidth={1.7} />
            </button>
            <button className="sidebar-icon-btn" title="New Excalidraw Drawing" onClick={() => handleNewExcalidraw(folderPath)}>
              <PenLine size={14} strokeWidth={1.7} />
            </button>
            <button className="sidebar-icon-btn" title="Refresh" onClick={handleRefresh}>
              <RotateCw size={13} strokeWidth={1.7} />
            </button>
          </>
        )}
        <button
          className={`sidebar-icon-btn sidebar-view-toggle ${view === 'bookmarks' ? 'active' : ''}`}
          title={view === 'bookmarks' ? 'File tree' : 'Bookmarks'}
          onClick={() => setView((v) => (v === 'bookmarks' ? 'tree' : 'bookmarks'))}
        >
          <Star size={13} strokeWidth={1.7} />
        </button>
        <button
          className={`sidebar-icon-btn sidebar-view-toggle ${view === 'graph' ? 'active' : ''}`}
          title={view === 'tree' ? 'Neural Graph' : view === 'graph' ? 'File Tree' : view === 'bookmarks' || view === 'calendar' ? 'File Tree' : 'Neural Graph'}
          onClick={() => setView((v) => (v === 'bookmarks' || v === 'calendar' ? 'tree' : v === 'tree' ? 'graph' : 'tree'))}
        >
          {view === 'tree' ? <GitBranch size={13} strokeWidth={1.7} /> : <List size={14} strokeWidth={1.7} />}
        </button>
        <button
          className={`sidebar-icon-btn sidebar-view-toggle ${view === 'calendar' ? 'active' : ''}`}
          title={view === 'calendar' ? 'File Tree' : 'Calendar'}
          onClick={() => setView((v) => (v === 'calendar' ? 'tree' : 'calendar'))}
        >
          <CalendarIcon size={13} strokeWidth={1.7} />
        </button>
      </div>

      {/* Inline create form — tree view only */}
      {view === 'tree' && creating && (
        <form className="sidebar-create-form" onSubmit={handleCreateSubmit}>
          <input
            ref={createInputRef}
            className="sidebar-create-input"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelCreate() }}
            placeholder={creating.type === 'file' ? 'File Name' : creating.type === 'canvas' ? 'Artifact name' : creating.type === 'excalidraw' ? 'Drawing name' : 'Folder Name'}
          />
          <button type="submit" className="sidebar-create-ok" title="Create">
            <Check size={12} strokeWidth={2.5} />
          </button>
          <button type="button" className="sidebar-create-cancel" onClick={cancelCreate} title="Cancel">
            <X size={12} strokeWidth={2.5} />
          </button>
        </form>
      )}

      {/* Shared filter bar — hide in bookmarks and calendar views */}
      {view !== 'bookmarks' && view !== 'calendar' && (
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(by, dir) => { setSortBy(by); setSortDir(dir) }}
        selectedTagIds={selectedTagIds}
        onTagToggle={handleTagToggle}
        onClearAll={handleClearAll}
      />
      )}

      {/* Main content area: tree, graph, bookmarks, calendar — flex so calendar doesn't push layout */}
      <div className="sidebar-content">
      {/* Bookmarks view */}
      {view === 'bookmarks' && (
        <div className="sidebar-bookmarks">
          {bookmarks.length === 0 ? (
            <div className="sidebar-tree-empty">
              No bookmarks. Open a note and click the star in the editor header to bookmark it.
            </div>
          ) : (
            <ul className="sidebar-bookmarks-list">
              {bookmarks.map((path) => {
                const name = path.split('/').pop() ?? path
                return (
                  <li key={path} className="sidebar-bookmarks-item">
                    <button
                      type="button"
                      className="sidebar-bookmarks-link"
                      onClick={() => {
                        openFileNode({
                          kind: 'file',
                          name,
                          path,
                          children: [],
                          depth: 0
                        })
                      }}
                      title={path}
                    >
                      {name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Neural Graph view */}
      {view === 'graph' && (
        <NeuralGraph query={query} selectedTagIds={selectedTagIds} />
      )}

      {/* Calendar view */}
      {view === 'calendar' && <CalendarPanel />}

      {/* Tree view */}
      {view === 'tree' && (
        <div className="sidebar-tree" key="tree">
          {/* Content matches — files where search query appears inside the file */}
          {query.trim() && (contentMatches.length > 0 || contentSearchLoading) && (
            <div className="sidebar-content-matches">
              <div className="sidebar-content-matches-heading">
                Matches in content
                {contentSearchLoading && <span className="sidebar-content-matches-loading"> …</span>}
              </div>
              {!contentSearchLoading && contentMatches.length === 0 && (
                <div className="sidebar-tree-empty">No content matches.</div>
              )}
              {!contentSearchLoading &&
                contentMatches.map((m) => {
                  const name = m.path.split('/').pop() ?? m.path
                  return (
                    <button
                      key={m.path}
                      type="button"
                      className="sidebar-content-match-item"
                      onClick={() =>
                        openFileNode({
                          kind: 'file',
                          name,
                          path: m.path,
                          children: [],
                          depth: 0
                        })
                      }
                      title={m.path}
                    >
                      <span className="sidebar-content-match-name">{name}</span>
                      {m.snippets[0] && (
                        <span className="sidebar-content-match-snippet" title={m.snippets[0]}>
                          {m.snippets[0]}
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          )}
          {filteredTree.length === 0 && !(query.trim() && contentMatches.length > 0) ? (
            <div className="sidebar-tree-empty" onContextMenu={(e) => e.preventDefault()}>
              {query || selectedTagIds.length > 0 ? 'No matching files.' : 'No files found.'}
            </div>
          ) : (
            <FileTree
              nodes={filteredTree}
              rootPath={folderPath}
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onNewCanvas={handleNewCanvas}
              onNewExcalidraw={handleNewExcalidraw}
            />
          )}
        </div>
      )}
      </div>
      <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
    </aside>
  )
}
