import { useRef, useState, useEffect } from 'react'
import { Search, X, ListFilter, SortAsc, SortDesc, Clock, Tag, ChevronDown } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import './FilterBar.css'

export type SortBy  = 'name' | 'mtime'
export type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { by: SortBy; dir: SortDir; label: string }[] = [
  { by: 'name', dir: 'asc', label: 'Name (A→Z)' },
  { by: 'name', dir: 'desc', label: 'Name (Z→A)' },
  { by: 'mtime', dir: 'desc', label: 'Modified (newest)' },
  { by: 'mtime', dir: 'asc', label: 'Modified (oldest)' }
]

function getSortLabel(sortBy: SortBy, sortDir: SortDir): string {
  return SORT_OPTIONS.find(o => o.by === sortBy && o.dir === sortDir)?.label ?? 'Sort'
}

interface FilterBarProps {
  query: string
  onQueryChange: (q: string) => void
  sortBy: SortBy
  sortDir: SortDir
  onSortChange: (by: SortBy, dir: SortDir) => void
  selectedTagIds: string[]
  onTagToggle: (id: string) => void
  onClearAll: () => void
}

export default function FilterBar({
  query, onQueryChange,
  sortBy, sortDir, onSortChange,
  selectedTagIds, onTagToggle,
  onClearAll,
}: FilterBarProps) {
  const customTags = useWorkspace((s) => s.customTags)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

  const isFiltered = query || selectedTagIds.length > 0

  useEffect(() => {
    if (!sortDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [sortDropdownOpen])

  function selectSort(by: SortBy, dir: SortDir) {
    onSortChange(by, dir)
    setSortDropdownOpen(false)
  }

  return (
    <div className="filterbar">
      {/* Search row */}
      <div className="filterbar-search">
        <Search size={11} strokeWidth={1.8} className="filterbar-search-icon" />
        <input
          ref={searchRef}
          className="filterbar-input"
          placeholder="Filter files…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          spellCheck={false}
        />
        {isFiltered && (
          <button className="filterbar-clear" onClick={onClearAll} title="Clear all filters">
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Sort dropdown + tag row */}
      <div className="filterbar-controls">
        <div className="filterbar-sort-wrap" ref={dropdownRef}>
          <button
            type="button"
            className="filterbar-sort-btn filterbar-sort-dropdown"
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            title="Choose sort order"
          >
            <ListFilter size={11} strokeWidth={1.8} />
            <span>{getSortLabel(sortBy, sortDir)}</span>
            <ChevronDown size={10} strokeWidth={2} className={sortDropdownOpen ? 'open' : ''} />
          </button>
          {sortDropdownOpen && (
            <div className="filterbar-sort-dropdown-menu">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={`${opt.by}-${opt.dir}`}
                  type="button"
                  className={`filterbar-sort-dropdown-item ${sortBy === opt.by && sortDir === opt.dir ? 'active' : ''}`}
                  onClick={() => selectSort(opt.by, opt.dir)}
                >
                  {opt.by === 'name' ? (opt.dir === 'asc' ? <SortAsc size={11} /> : <SortDesc size={11} />) : <Clock size={11} />}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tag filter chips */}
      {customTags.length > 0 && (
        <div className="filterbar-tags">
          <Tag size={10} strokeWidth={1.8} className="filterbar-tags-icon" />
          <div className="filterbar-tag-chips">
            {customTags.map((tag) => {
              const active = selectedTagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  className={`filterbar-tag-chip ${active ? 'active' : ''}`}
                  style={{ '--chip-color': tag.color } as React.CSSProperties}
                  onClick={() => onTagToggle(tag.id)}
                  title={`Filter by "${tag.name}"`}
                >
                  <span className="chip-dot" />
                  {tag.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
