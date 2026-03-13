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
  {
    id: 'preset-bw',
    name: 'Black & White',
    type: 'preset',
    colors: {
      accentColor: '#ffffff',
      bgBase: '#000000',
      textPrimary: '#ffffff'
    }
  },
  {
    id: 'preset-midnight',
    name: 'Midnight Blue',
    type: 'preset',
    colors: {
      accentColor: '#60a5fa',
      bgBase: '#000000',
      textPrimary: '#ffffff'
    }
  },
  {
    id: 'preset-matrix',
    name: 'Matrix Hacker',
    type: 'preset',
    colors: {
      accentColor: '#22c55e',
      bgBase: '#000000',
      textPrimary: '#ffffff'
    }
  },
  {
    id: 'preset-rose',
    name: 'Rose Gold',
    type: 'preset',
    colors: {
      accentColor: '#f43f5e',
      bgBase: '#000000',
      textPrimary: '#ffffff'
    }
  }
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
  /** Split ratio for editor vs preview (0–1). 0.5 = half and half. */
  editorPreviewRatio: number

  openSettings: () => void
  closeSettings: () => void
  setActiveTheme: (id: string) => void
  addCustomTheme: (theme: Theme) => void
  deleteCustomTheme: (id: string) => void
  setTypography: (val: 'sans' | 'serif' | 'mono') => void
  setLineWrapping: (val: boolean) => void
  setFontSize: (val: number) => void
  setTabSize: (val: number) => void
  setAutoSave: (val: boolean) => void
  setEditorPreviewRatio: (val: number) => void
  resetSettings: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      isSettingsOpen: false,
      activeThemeId: 'preset-bw',
      customThemes: [],
      typography: 'sans',
      lineWrapping: true,
      fontSize: 14,
      tabSize: 2,
      autoSave: true,
      editorPreviewRatio: 0.5,

      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
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
      setTypography: (typography) => set({ typography }),
      setLineWrapping: (lineWrapping) => set({ lineWrapping }),
      setFontSize: (fontSize) => set({ fontSize }),
      setTabSize: (tabSize) => set({ tabSize }),
      setAutoSave: (autoSave) => set({ autoSave }),
      setEditorPreviewRatio: (editorPreviewRatio) => set({ editorPreviewRatio: Math.max(0.2, Math.min(0.8, editorPreviewRatio)) }),
      resetSettings: () => set({ 
        activeThemeId: 'preset-bw',
        typography: 'sans', 
        lineWrapping: true,
        fontSize: 14,
        tabSize: 2,
        autoSave: true,
        editorPreviewRatio: 0.5
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
        editorPreviewRatio: state.editorPreviewRatio
      })
    }
  )
)
