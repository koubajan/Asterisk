import { useEffect, useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  addDays,
  parseISO
} from 'date-fns'
import { X } from 'lucide-react'
import { useWorkspace, getNotesByDate, getUpcomingNotes } from '../../store/useWorkspace'
import './Calendar.css'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeWorkspaceIndex = useWorkspace((s) => s.activeWorkspaceIndex)
  const noteSchedules = useWorkspace((s) => s.noteSchedules)
  const loadScheduledNotes = useWorkspace((s) => s.loadScheduledNotes)
  const setNoteDate = useWorkspace((s) => s.setNoteDate)
  const openFileNode = useWorkspace((s) => s.openFileNode)
  const tree = useWorkspace((s) => s.tree)

  async function handleRemoveSchedule(path: string, e: React.MouseEvent) {
    e.stopPropagation()
    await setNoteDate(path, null)
    await loadScheduledNotes()
  }

  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const rootPath = workspaces[activeWorkspaceIndex]?.path ?? ''

  useEffect(() => {
    if (rootPath) loadScheduledNotes()
  }, [rootPath, loadScheduledNotes])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)

  const days: Date[] = []
  let d = calStart
  while (d <= calEnd) {
    days.push(d)
    d = addDays(d, 1)
  }

  function findNodeByPath(path: string) {
    const walk = (nodes: typeof tree): (typeof tree)[0] | null => {
      for (const n of nodes) {
        if (n.path === path) return n
        if (n.kind === 'folder' && n.children.length) {
          const found = walk(n.children)
          if (found) return found
        }
      }
      return null
    }
    return walk(tree)
  }

  const selectedDayNotes = selectedDate ? getNotesByDate(noteSchedules, selectedDate) : []
  const upcoming = getUpcomingNotes(noteSchedules, 10)

  return (
    <div className="calendar-panel">
      <header className="calendar-header">
        <span className="calendar-title">{format(viewDate, 'MMMM yyyy')}</span>
        <div className="calendar-nav">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            title="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setViewDate(new Date())}
            title="This month"
          >
            Today
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            title="Next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="calendar-month-grid">
        <div className="calendar-weekdays">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calendar-days">
          {days.map((day) => {
            const notes = getNotesByDate(noteSchedules, day)
            const hasNotes = notes.length > 0
            const selected = selectedDate && isSameDay(day, selectedDate)
            return (
              <button
                key={day.toISOString()}
                type="button"
                className={`calendar-day ${!isSameMonth(day, viewDate) ? 'other-month' : ''} ${isToday(day) ? 'today' : ''} ${hasNotes ? 'has-notes' : ''} ${selected ? 'selected' : ''}`}
                onClick={() => setSelectedDate(day)}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && selectedDayNotes.length > 0 && (
        <div className="calendar-day-notes">
          <div className="calendar-day-notes-title">
            {format(selectedDate, 'EEE, MMM d')} — {selectedDayNotes.length} note{selectedDayNotes.length !== 1 ? 's' : ''}
          </div>
          <div className="calendar-day-notes-list">
            {selectedDayNotes.map((path) => {
              const node = findNodeByPath(path)
              const name = node?.name ?? path.replace(/^.*[/\\]/, '')
              return (
                <div key={path} className="calendar-note-item">
                  <button
                    type="button"
                    className="calendar-note-name"
                    onClick={() => node && openFileNode(node)}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    className="calendar-note-remove"
                    onClick={(e) => handleRemoveSchedule(path, e)}
                    title="Remove from calendar"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="calendar-upcoming">
        <div className="calendar-upcoming-title">Upcoming</div>
        {upcoming.length === 0 ? (
          <div className="calendar-empty">No scheduled notes</div>
        ) : (
          <div className="calendar-upcoming-list">
            {upcoming.map(({ path, scheduled }) => {
              const node = findNodeByPath(path)
              const name = node?.name ?? path.replace(/^.*[/\\]/, '')
              let dateLabel = scheduled
              try {
                dateLabel = format(parseISO(scheduled), 'MMM d, h:mm a')
              } catch {
                // keep raw
              }
              return (
                <div key={path} className="calendar-upcoming-item">
                  <button
                    type="button"
                    className="calendar-upcoming-info"
                    onClick={() => node && openFileNode(node)}
                  >
                    <span>{name}</span>
                    <time>{dateLabel}</time>
                  </button>
                  <button
                    type="button"
                    className="calendar-note-remove"
                    onClick={(e) => handleRemoveSchedule(path, e)}
                    title="Remove from calendar"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
