import { useState, useRef } from 'react'
import { useSettings, PRESET_THEMES, Theme, ThemeColors, REMINDER_ADVANCE_OPTIONS } from '../../store/useSettings'
import { X, RotateCcw, Plus, Trash2, Palette, FileText, Key, Keyboard, Download, Upload, Eye, Columns2, Bell } from 'lucide-react'
import './SettingsModal.css'

type SettingsSection = 'appearance' | 'editor' | 'notifications' | 'ai' | 'shortcuts'

const SHORTCUTS_LIST: { category: string; keys: { action: string; keys: string }[] }[] = [
  { category: 'App', keys: [
    { action: 'Open folder', keys: '⌘⇧O' },
    { action: 'New file', keys: '⌘N' },
    { action: 'Save', keys: '⌘S' },
    { action: 'Toggle sidebar', keys: '⌘⇧B' },
    { action: 'Toggle preview', keys: '⌘\\' },
    { action: 'Fullscreen', keys: '⌘⇧F' },
    { action: 'Bookmark', keys: '⌘D' }
  ]},
  { category: 'Editor', keys: [
    { action: 'Bold', keys: '⌘B' },
    { action: 'Italic', keys: '⌘I' },
    { action: 'Link', keys: '⌘K' },
    { action: 'Insert table', keys: '⌘⇧T' },
    { action: 'Table: add row', keys: '⌘⌥Enter' },
    { action: 'Table: add column', keys: '⌘⌥⇧Enter' },
    { action: 'Find', keys: '⌘F' }
  ]}
]

export default function SettingsModal() {
  const [section, setSection] = useState<SettingsSection>('appearance')
  const importInputRef = useRef<HTMLInputElement>(null)
  const {
    isSettingsOpen, closeSettings,
    activeThemeId, customThemes,
    typography, lineWrapping, fontSize, tabSize, autoSave, editorMode,
    openaiApiKey, anthropicApiKey, geminiApiKey, setOpenaiApiKey, setAnthropicApiKey, setGeminiApiKey,
    remindersEnabled, reminderAdvanceMinutes, setRemindersEnabled, setReminderAdvanceMinutes,
    snapshotOnAutoSave, setSnapshotOnAutoSave,
    setActiveTheme, addCustomTheme, deleteCustomTheme, exportThemes, importThemes,
    setTypography, setLineWrapping, setFontSize, setTabSize, setAutoSave, setEditorMode,
    resetSettings
  } = useSettings()

  const [isCreatingTheme, setIsCreatingTheme] = useState(false)
  const [newThemeName, setNewThemeName] = useState('Custom')
  const [newThemeColors, setNewThemeColors] = useState<ThemeColors>({
    accentColor: '#ffffff',
    bgBase: '#111111',
    textPrimary: '#ffffff'
  })

  if (!isSettingsOpen) return null

  const allThemes = [...PRESET_THEMES, ...customThemes]

  const handleCreateTheme = () => {
    if (!newThemeName.trim()) return
    const theme: Theme = {
      id: `custom-${Date.now()}`,
      name: newThemeName.trim(),
      type: 'custom',
      colors: newThemeColors
    }
    addCustomTheme(theme)
    setIsCreatingTheme(false)
  }

  const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'editor', label: 'Editor', icon: <FileText size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'ai', label: 'AI', icon: <Key size={16} /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> }
  ]

  const handleExportThemes = () => {
    const blob = new Blob([exportThemes()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'asterisk-themes.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportThemes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      if (text) importThemes(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="settings-overlay" onClick={closeSettings}>
      <div className="settings-modal settings-modal-with-sidebar" onClick={e => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={closeSettings}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-layout">
          <nav className="settings-sidebar">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={`settings-nav-item ${section === id ? 'active' : ''}`}
                onClick={() => setSection(id)}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <section className="settings-body">
            {section === 'appearance' && (
              <>
                <div className="settings-group">
                  <h3>Themes</h3>
                  <div className="theme-grid">
                    {allThemes.map(theme => (
                      <div
                        key={theme.id}
                        className={`theme-card ${activeThemeId === theme.id ? 'active' : ''}`}
                        onClick={() => setActiveTheme(theme.id)}
                        style={{ backgroundColor: theme.colors.bgBase, borderColor: activeThemeId === theme.id ? theme.colors.accentColor : 'transparent' }}
                      >
                        <div className="theme-card-colors">
                          <span style={{ backgroundColor: theme.colors.accentColor }} />
                          <span style={{ backgroundColor: theme.colors.textPrimary }} />
                        </div>
                        <div className="theme-card-info">
                          <span style={{ color: theme.colors.textPrimary }}>{theme.name}</span>
                          {theme.type === 'custom' && (
                            <button
                              className="theme-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteCustomTheme(theme.id)
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="settings-theme-export-import">
                    <button type="button" className="settings-btn-secondary" onClick={handleExportThemes}>
                      <Download size={14} /> Export themes
                    </button>
                    <button type="button" className="settings-btn-secondary" onClick={() => importInputRef.current?.click()}>
                      <Upload size={14} /> Import themes
                    </button>
                    <input ref={importInputRef} type="file" accept=".json,application/json" className="settings-import-input" onChange={handleImportThemes} />
                  </div>
                  {!isCreatingTheme ? (
                    <button className="btn-create-theme" onClick={() => setIsCreatingTheme(true)}>
                      <Plus size={14} /> Create custom theme
                    </button>
                  ) : (
                    <div className="custom-theme-creator">
                      <input
                        type="text"
                        className="theme-name-input"
                        value={newThemeName}
                        onChange={e => setNewThemeName(e.target.value)}
                        placeholder="Name"
                      />
                      <div className="settings-row">
                        <label>Background</label>
                        <input type="color" value={newThemeColors.bgBase} onChange={e => setNewThemeColors(prev => ({ ...prev, bgBase: e.target.value }))} />
                      </div>
                      <div className="settings-row">
                        <label>Accent</label>
                        <input type="color" value={newThemeColors.accentColor} onChange={e => setNewThemeColors(prev => ({ ...prev, accentColor: e.target.value }))} />
                      </div>
                      <div className="settings-row">
                        <label>Text</label>
                        <input type="color" value={newThemeColors.textPrimary} onChange={e => setNewThemeColors(prev => ({ ...prev, textPrimary: e.target.value }))} />
                      </div>
                      <div className="custom-theme-actions">
                        <button onClick={() => setIsCreatingTheme(false)}>Cancel</button>
                        <button className="primary" onClick={handleCreateTheme}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="settings-group">
                  <h3>Typography</h3>
                  <div className="settings-row">
                    <label>UI font</label>
                    <select value={typography} onChange={e => setTypography(e.target.value as 'sans' | 'serif' | 'mono')}>
                      <option value="sans">Sans-serif</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Monospace</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {section === 'editor' && (
              <>
                <div className="settings-group">
                  <h3>Editor Mode</h3>
                  <div className="settings-mode-toggle">
                    <button
                      type="button"
                      className={`settings-mode-btn ${editorMode === 'live-preview' ? 'active' : ''}`}
                      onClick={() => setEditorMode('live-preview')}
                    >
                      <Eye size={16} />
                      <span>Live Preview</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-mode-btn ${editorMode === 'split-view' ? 'active' : ''}`}
                      onClick={() => setEditorMode('split-view')}
                    >
                      <Columns2 size={16} />
                      <span>Split View</span>
                    </button>
                  </div>
                  <p className="settings-mode-hint">
                    {editorMode === 'live-preview'
                      ? 'Markdown syntax is hidden until you move the cursor to a line.'
                      : 'Raw markdown on the left, rendered preview on the right.'}
                  </p>
                </div>
                <div className="settings-group">
                  <h3>Editor</h3>
                  <div className="settings-row">
                    <label>Font size</label>
                    <input
                      type="number"
                      className="settings-input-num"
                      min={10}
                      max={24}
                      value={fontSize}
                      onChange={e => setFontSize(Math.min(24, Math.max(10, parseInt(e.target.value, 10) || 14)))}
                    />
                  </div>
                  <div className="settings-row">
                    <label>Tab size</label>
                    <input
                      type="number"
                      className="settings-input-num"
                      min={2}
                      max={8}
                      value={tabSize}
                      onChange={e => setTabSize(Math.min(8, Math.max(2, parseInt(e.target.value, 10) || 2)))}
                    />
                  </div>
                  <div className="settings-row">
                    <label>Line wrapping</label>
                    <input type="checkbox" checked={lineWrapping} onChange={e => setLineWrapping(e.target.checked)} />
                  </div>
                </div>
                <div className="settings-group">
                  <h3>Behavior</h3>
                  <div className="settings-row">
                    <label>Auto-save</label>
                    <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
                  </div>
                  <div className="settings-row">
                    <label>
                      Create version snapshots on autosave
                      <span className="settings-label-hint">Save file history automatically</span>
                    </label>
                    <input 
                      type="checkbox" 
                      checked={snapshotOnAutoSave} 
                      onChange={e => setSnapshotOnAutoSave(e.target.checked)}
                      disabled={!autoSave}
                    />
                  </div>
                </div>
                <p className="settings-ideas">
                  Ideas for later: preview font size, confirm when closing unsaved tab, default canvas zoom, date format for notes.
                </p>
              </>
            )}

            {section === 'notifications' && (
              <div className="settings-group">
                <h3>Reminders</h3>
                <p className="settings-hint">
                  Get desktop notifications for scheduled notes. Set a date on any note using the calendar in the sidebar.
                </p>
                <div className="settings-row">
                  <label>Enable reminders</label>
                  <input
                    type="checkbox"
                    checked={remindersEnabled}
                    onChange={e => setRemindersEnabled(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>Remind me</label>
                  <select
                    value={reminderAdvanceMinutes}
                    onChange={e => setReminderAdvanceMinutes(parseInt(e.target.value, 10))}
                    disabled={!remindersEnabled}
                  >
                    {REMINDER_ADVANCE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {section === 'ai' && (
              <div className="settings-group">
                <h3>API keys</h3>
                <p className="settings-hint">Stored locally. Use the Assistant button in the top bar to open the AI panel.</p>
                <div className="settings-row">
                  <label>OpenAI</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={openaiApiKey}
                    onChange={e => setOpenaiApiKey(e.target.value)}
                    placeholder=""
                    autoComplete="off"
                  />
                </div>
                <div className="settings-row">
                  <label>Anthropic</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={anthropicApiKey}
                    onChange={e => setAnthropicApiKey(e.target.value)}
                    placeholder=""
                    autoComplete="off"
                  />
                </div>
                <div className="settings-row">
                  <label>Gemini</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={geminiApiKey}
                    onChange={e => setGeminiApiKey(e.target.value)}
                    placeholder=""
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            {section === 'shortcuts' && (
              <div className="settings-group">
                <h3>Keybindings</h3>
                {SHORTCUTS_LIST.map(({ category, keys }) => (
                  <div key={category} className="settings-shortcuts-block">
                    <h4 className="settings-shortcuts-category">{category}</h4>
                    <ul className="settings-shortcuts-list">
                      {keys.map(({ action, keys: k }) => (
                        <li key={action} className="settings-shortcuts-row">
                          <span>{action}</span>
                          <kbd>{k}</kbd>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="settings-footer">
          <button className="settings-btn-reset" onClick={resetSettings}>
            <RotateCcw size={14} /> Reset defaults
          </button>
          <button className="settings-btn-done" onClick={closeSettings}>Done</button>
        </footer>
      </div>
    </div>
  )
}
