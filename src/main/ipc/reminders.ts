import { Notification, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

interface ScheduledNote {
  path: string
  scheduled: string
  reminder?: string
}

interface ReminderConfig {
  enabled: boolean
  advanceMinutes: number
  workspacePath: string | null
}

const firedReminders = new Set<string>()
let checkInterval: ReturnType<typeof setInterval> | null = null
let currentConfig: ReminderConfig = {
  enabled: true,
  advanceMinutes: 5,
  workspacePath: null
}

function extractFromContent(content: string): { scheduled: string | null; reminder: string | null } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m)
  if (!frontmatterMatch) return { scheduled: null, reminder: null }
  
  const block = frontmatterMatch[1]
  
  let scheduled: string | null = null
  const scheduledMatch = block.match(/^\s*scheduled:\s*["']?([^"'\n]+?)["']?\s*$/m)
  if (scheduledMatch) {
    scheduled = scheduledMatch[1].trim()
  }
  
  let reminder: string | null = null
  const reminderMatch = block.match(/^\s*reminder:\s*["']?(.+?)["']?\s*$/m)
  if (reminderMatch) {
    reminder = reminderMatch[1].trim()
  }
  
  return { scheduled, reminder }
}

async function scanScheduledNotes(folderPath: string): Promise<ScheduledNote[]> {
  const results: ScheduledNote[] = []

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) await walk(fullPath)
        } else if (entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const { scheduled, reminder } = extractFromContent(content)
            if (scheduled) {
              const note: ScheduledNote = { path: fullPath, scheduled }
              if (reminder) note.reminder = reminder
              results.push(note)
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  await walk(folderPath)
  return results
}

function showReminderNotification(note: ScheduledNote) {
  const fileName = path.basename(note.path, '.md')
  const title = note.reminder || fileName
  const body = note.reminder ? fileName : 'Scheduled note'
  
  const notification = new Notification({
    title,
    body,
    silent: false,
    urgency: 'normal'
  })

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.focus()
      win.webContents.send('reminder:open-note', note.path)
    }
  })

  notification.show()
}

async function checkReminders() {
  if (!currentConfig.enabled || !currentConfig.workspacePath) return

  try {
    const notes = await scanScheduledNotes(currentConfig.workspacePath)
    const now = new Date()
    const advanceMs = currentConfig.advanceMinutes * 60 * 1000

    for (const note of notes) {
      const reminderKey = `${note.path}:${note.scheduled}`
      if (firedReminders.has(reminderKey)) continue

      try {
        const scheduledDate = new Date(note.scheduled)
        if (isNaN(scheduledDate.getTime())) continue

        const reminderTime = new Date(scheduledDate.getTime() - advanceMs)
        
        if (now >= reminderTime && now < scheduledDate) {
          firedReminders.add(reminderKey)
          showReminderNotification(note)
        } else if (now >= scheduledDate && now < new Date(scheduledDate.getTime() + 60000)) {
          if (!firedReminders.has(reminderKey)) {
            firedReminders.add(reminderKey)
            showReminderNotification(note)
          }
        }
      } catch {
        // skip invalid dates
      }
    }

    // Clean old fired reminders (older than 1 day)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    for (const key of firedReminders) {
      const [, scheduled] = key.split(':')
      if (scheduled) {
        try {
          const date = new Date(scheduled)
          if (date < oneDayAgo) {
            firedReminders.delete(key)
          }
        } catch {
          // keep it
        }
      }
    }
  } catch {
    // ignore scan errors
  }
}

export function startReminderService() {
  if (checkInterval) return
  checkInterval = setInterval(checkReminders, 30000) // Check every 30 seconds
  checkReminders() // Check immediately on start
}

export function stopReminderService() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

export function updateReminderConfig(config: Partial<ReminderConfig>) {
  currentConfig = { ...currentConfig, ...config }
  if (currentConfig.enabled && !checkInterval) {
    startReminderService()
  } else if (!currentConfig.enabled && checkInterval) {
    stopReminderService()
  }
}

export function registerReminderHandlers() {
  ipcMain.handle('reminder:set-config', (_e, config: Partial<ReminderConfig>) => {
    updateReminderConfig(config)
    return { ok: true }
  })

  ipcMain.handle('reminder:get-config', () => {
    return { ok: true, data: currentConfig }
  })

  ipcMain.handle('reminder:clear-fired', () => {
    firedReminders.clear()
    return { ok: true }
  })
}
