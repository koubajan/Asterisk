import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ThemeColors {
  accentColor: string
  bgBase: string
  textPrimary: string
}

export interface Theme {
  id: string
  name: string
  type: 'preset' | 'custom'
  colors: ThemeColors
}

export const PRESET_THEMES: Theme[] = [
  { id: 'preset-bw', name: 'Black & White', type: 'preset', colors: { accentColor: '#ffffff', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-midnight', name: 'Blue', type: 'preset', colors: { accentColor: '#60a5fa', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-matrix', name: 'Green', type: 'preset', colors: { accentColor: '#22c55e', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-rose', name: 'Rose', type: 'preset', colors: { accentColor: '#f43f5e', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-purple', name: 'Purple', type: 'preset', colors: { accentColor: '#a78bfa', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-amber', name: 'Amber', type: 'preset', colors: { accentColor: '#fbbf24', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-cyan', name: 'Cyan', type: 'preset', colors: { accentColor: '#22d3ee', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-orange', name: 'Orange', type: 'preset', colors: { accentColor: '#fb923c', bgBase: '#000000', textPrimary: '#ffffff' } },
  { id: 'preset-slate', name: 'Slate', type: 'preset', colors: { accentColor: '#94a3b8', bgBase: '#000000', textPrimary: '#ffffff' } }
]

export type EditorMode = 'live-preview' | 'split-view'

export const REMINDER_ADVANCE_OPTIONS = [
  { value: 0, label: 'At scheduled time' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' }
]

interface SettingsState {
  isSettingsOpen: boolean
  activeThemeId: string
  customThemes: Theme[]
  typography: 'sans' | 'serif' | 'mono'
  lineWrapping: boolean
  fontSize: number
  tabSize: number
  autoSave: boolean
  /** Editor mode: live-preview hides syntax near cursor, split-view shows raw editor + preview pane. */
  editorMode: EditorMode
  /** Split ratio for editor vs preview (0–1). 0.5 = half and half. */
  editorPreviewRatio: number
  /** AI panel width in px (resizable). */
  aiPanelWidth: number
  openaiApiKey: string
  anthropicApiKey: string
  geminiApiKey: string
  /** Whether desktop reminders are enabled */
  remindersEnabled: boolean
  /** Minutes before scheduled time to show reminder */
  reminderAdvanceMinutes: number
  /** Whether to create version snapshots on autosave */
  snapshotOnAutoSave: boolean

  openSettings: () => void
  closeSettings: () => void
  setOpenaiApiKey: (key: string) => void
  setAnthropicApiKey: (key: string) => void
  setGeminiApiKey: (key: string) => void
  setActiveTheme: (id: string) => void
  addCustomTheme: (theme: Theme) => void
  deleteCustomTheme: (id: string) => void
  exportThemes: () => string
  importThemes: (json: string) => void
  setTypography: (val: 'sans' | 'serif' | 'mono') => void
  setLineWrapping: (val: boolean) => void
  setFontSize: (val: number) => void
  setTabSize: (val: number) => void
  setAutoSave: (val: boolean) => void
  setEditorMode: (val: EditorMode) => void
  setEditorPreviewRatio: (val: number) => void
  setAiPanelWidth: (val: number) => void
  setRemindersEnabled: (val: boolean) => void
  setReminderAdvanceMinutes: (val: number) => void
  setSnapshotOnAutoSave: (val: boolean) => void
  resetSettings: () => void
}

function isTheme(t: unknown): t is Theme {
  return (
    typeof t === 'object' &&
    t !== null &&
    'id' in t &&
    'name' in t &&
    (t as Theme).type === 'custom' &&
    'colors' in t &&
    typeof (t as Theme).colors?.accentColor === 'string' &&
    typeof (t as Theme).colors?.bgBase === 'string' &&
    typeof (t as Theme).colors?.textPrimary === 'string'
  )
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      isSettingsOpen: false,
      activeThemeId: 'preset-bw',
      customThemes: [],
      typography: 'sans',
      lineWrapping: true,
      fontSize: 14,
      tabSize: 2,
      autoSave: true,
      editorMode: 'live-preview',
      editorPreviewRatio: 0.5,
      aiPanelWidth: 360,
      openaiApiKey: '',
      anthropicApiKey: '',
      geminiApiKey: '',
      remindersEnabled: true,
      reminderAdvanceMinutes: 5,
      snapshotOnAutoSave: false,

      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setAnthropicApiKey: (anthropicApiKey) => set({ anthropicApiKey }),
      setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
      setActiveTheme: (id) => set({ activeThemeId: id }),
      addCustomTheme: (theme) => set((state) => ({ 
        customThemes: [...state.customThemes, theme],
        activeThemeId: theme.id // auto apply on create
      })),
      deleteCustomTheme: (id) => set((state) => {
        const remaining = state.customThemes.filter(t => t.id !== id)
        const nextId = state.activeThemeId === id ? 'preset-bw' : state.activeThemeId
        return { customThemes: remaining, activeThemeId: nextId }
      }),
      exportThemes: () => JSON.stringify({ version: 1, customThemes: get().customThemes }),
      importThemes: (json) => {
        try {
          const data = JSON.parse(json) as { customThemes?: unknown[] }
          if (!Array.isArray(data?.customThemes)) return
          const themes = data.customThemes.filter(isTheme).map((t, i) => ({ ...t, id: `custom-import-${Date.now()}-${i}` }))
          if (themes.length) set((state) => ({ customThemes: [...state.customThemes, ...themes] }))
        } catch { /* ignore */ }
      },
      setTypography: (typography) => set({ typography }),
      setLineWrapping: (lineWrapping) => set({ lineWrapping }),
      setFontSize: (fontSize) => set({ fontSize }),
      setTabSize: (tabSize) => set({ tabSize }),
      setAutoSave: (autoSave) => set({ autoSave }),
      setEditorMode: (editorMode) => set({ editorMode }),
      setEditorPreviewRatio: (editorPreviewRatio) => set({ editorPreviewRatio: Math.max(0.2, Math.min(0.8, editorPreviewRatio)) }),
      setAiPanelWidth: (aiPanelWidth) => set({ aiPanelWidth: Math.max(280, Math.min(600, aiPanelWidth)) }),
      setRemindersEnabled: (remindersEnabled) => set({ remindersEnabled }),
      setReminderAdvanceMinutes: (reminderAdvanceMinutes) => set({ reminderAdvanceMinutes }),
      setSnapshotOnAutoSave: (snapshotOnAutoSave) => set({ snapshotOnAutoSave }),
      resetSettings: () => set({ 
        activeThemeId: 'preset-bw',
        typography: 'sans', 
        lineWrapping: true,
        fontSize: 14,
        tabSize: 2,
        autoSave: true,
        editorMode: 'live-preview',
        editorPreviewRatio: 0.5,
        aiPanelWidth: 360,
        remindersEnabled: true,
        reminderAdvanceMinutes: 5,
        snapshotOnAutoSave: false
      })
    }),
    {
      name: 'asterisk-settings',
      partialize: (state) => ({
        activeThemeId: state.activeThemeId,
        customThemes: state.customThemes,
        typography: state.typography,
        lineWrapping: state.lineWrapping,
        fontSize: state.fontSize,
        tabSize: state.tabSize,
        autoSave: state.autoSave,
        editorMode: state.editorMode,
        editorPreviewRatio: state.editorPreviewRatio,
        aiPanelWidth: state.aiPanelWidth,
        openaiApiKey: state.openaiApiKey,
        anthropicApiKey: state.anthropicApiKey,
        geminiApiKey: state.geminiApiKey,
        remindersEnabled: state.remindersEnabled,
        reminderAdvanceMinutes: state.reminderAdvanceMinutes,
        snapshotOnAutoSave: state.snapshotOnAutoSave
      })
    }
  )
)
