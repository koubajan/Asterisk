import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { useWorkspace } from '../../store/useWorkspace'
import './Calendar.css'

interface NoteDatePickerProps {
  filePath: string | null
  onRefresh?: () => void
}

export default function NoteDatePicker({ filePath, onRefresh }: NoteDatePickerProps) {
  const noteSchedules = useWorkspace((s) => s.noteSchedules)
  const noteReminders = useWorkspace((s) => s.noteReminders)
  const setNoteDate = useWorkspace((s) => s.setNoteDate)
  const loadScheduledNotes = useWorkspace((s) => s.loadScheduledNotes)

  const scheduled = filePath ? noteSchedules[filePath] ?? null : null
  const existingReminder = filePath ? noteReminders[filePath] ?? '' : ''
  const [pickerOpen, setPickerOpen] = useState(false)
  const [localDate, setLocalDate] = useState(scheduled ? format(parseISO(scheduled), "yyyy-MM-dd'T'HH:mm") : '')
  const [localTime, setLocalTime] = useState(scheduled ? format(parseISO(scheduled), 'HH:mm') : '12:00')
  const [localReminder, setLocalReminder] = useState(existingReminder)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (filePath) loadScheduledNotes()
  }, [filePath, loadScheduledNotes])

  useEffect(() => {
    if (scheduled) {
      try {
        const d = parseISO(scheduled)
        setLocalDate(format(d, "yyyy-MM-dd'T'HH:mm"))
        setLocalTime(format(d, 'HH:mm'))
      } catch {
        setLocalDate('')
        setLocalTime('12:00')
      }
    } else {
      setLocalDate('')
      setLocalTime('12:00')
    }
    setLocalReminder(existingReminder)
  }, [scheduled, existingReminder])

  useLayoutEffect(() => {
    if (!pickerOpen || !triggerRef.current) {
      setDropdownRect(null)
      return
    }
    const el = triggerRef.current
    const rect = el.getBoundingClientRect()
    const dropdownHeight = 140
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownRect({ top: rect.top - dropdownHeight - 4, left: rect.left })
    } else {
      setDropdownRect({ top: rect.bottom + 4, left: rect.left })
    }
  }, [pickerOpen])

  useEffect(() => {
    if (!pickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      const dropdown = document.querySelector('.note-date-picker-dropdown-portal')
      if (dropdown?.contains(target)) return
      setPickerOpen(false)
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [pickerOpen])

  if (!filePath || !filePath.endsWith('.md')) return null

  async function handleSet() {
    if (!filePath || !localDate.trim()) return
    const iso = localDate.includes('T') ? localDate : `${localDate}T${localTime}:00`
    const reminder = localReminder.trim() || null
    await setNoteDate(filePath, iso, reminder)
    await loadScheduledNotes()
    onRefresh?.()
    setPickerOpen(false)
  }

  async function handleClear() {
    if (!filePath) return
    await setNoteDate(filePath, null)
    await loadScheduledNotes()
    onRefresh?.()
    setPickerOpen(false)
  }

  const scheduleTitle = scheduled
    ? (() => {
        try {
          return `Scheduled: ${format(parseISO(scheduled), 'MMM d, yyyy · HH:mm')}`
        } catch {
          return 'Scheduled'
        }
      })()
    : 'Schedule this note'

  const dropdownContent =
    pickerOpen &&
    dropdownRect && (
      <div
        className="note-date-picker-dropdown note-date-picker-dropdown-portal"
        style={{ top: dropdownRect.top, left: dropdownRect.left }}
      >
        <div className="note-date-picker-dropdown-inner">
          <input
            type="datetime-local"
            className="note-date-picker-datetime"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
          />
          <input
            type="text"
            className="note-date-picker-reminder"
            value={localReminder}
            onChange={(e) => setLocalReminder(e.target.value)}
            placeholder="Reminder message (optional)"
          />
          <div className="note-date-picker-actions">
            <button type="button" className="note-date-picker-btn" onClick={handleSet}>
              Set
            </button>
            <button type="button" className="note-date-picker-btn" onClick={() => setPickerOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="note-date-picker-wrap" ref={triggerRef}>
      <button
        type="button"
        className="note-date-picker-btn note-date-picker-btn-icon"
        onClick={() => setPickerOpen((v) => !v)}
        title={scheduleTitle}
      >
        <CalendarIcon size={14} strokeWidth={1.7} />
      </button>
      {scheduled && (
        <button type="button" className="note-date-picker-clear note-date-picker-clear-icon" onClick={handleClear} title="Clear schedule">
          <X size={12} strokeWidth={2} />
        </button>
      )}
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  )
}
