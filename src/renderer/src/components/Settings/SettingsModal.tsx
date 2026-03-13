import { useState } from 'react'
import { useSettings, PRESET_THEMES, Theme, ThemeColors } from '../../store/useSettings'
import { X, RotateCcw, Plus, Trash2 } from 'lucide-react'
import './SettingsModal.css'

export default function SettingsModal() {
  const {
    isSettingsOpen, closeSettings,
    activeThemeId, customThemes,
    typography, lineWrapping, fontSize, tabSize, autoSave,
    setActiveTheme, addCustomTheme, deleteCustomTheme,
    setTypography, setLineWrapping, setFontSize, setTabSize, setAutoSave,
    resetSettings
  } = useSettings()

  const [isCreatingTheme, setIsCreatingTheme] = useState(false)
  const [newThemeName, setNewThemeName] = useState('My Custom Theme')
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

  return (
    <div className="settings-overlay" onClick={closeSettings}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={closeSettings}>
            <X size={18} />
          </button>
        </header>

        <section className="settings-body">
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
            
            {!isCreatingTheme ? (
              <button className="btn-create-theme" onClick={() => setIsCreatingTheme(true)}>
                <Plus size={14} /> Create Custom Theme
              </button>
            ) : (
              <div className="custom-theme-creator">
                <input 
                  type="text" 
                  className="theme-name-input"
                  value={newThemeName} 
                  onChange={e => setNewThemeName(e.target.value)}
                  placeholder="Theme Name"
                />
                <div className="settings-row">
                  <label>Background Color</label>
                  <input type="color" value={newThemeColors.bgBase} onChange={e => setNewThemeColors(prev => ({ ...prev, bgBase: e.target.value }))} />
                </div>
                <div className="settings-row">
                  <label>Accent Color</label>
                  <input type="color" value={newThemeColors.accentColor} onChange={e => setNewThemeColors(prev => ({ ...prev, accentColor: e.target.value }))} />
                </div>
                <div className="settings-row">
                  <label>Text Color</label>
                  <input type="color" value={newThemeColors.textPrimary} onChange={e => setNewThemeColors(prev => ({ ...prev, textPrimary: e.target.value }))} />
                </div>
                <div className="custom-theme-actions">
                  <button onClick={() => setIsCreatingTheme(false)}>Cancel</button>
                  <button className="primary" onClick={handleCreateTheme}>Save Theme</button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-group">
            <h3>Editor — Appearance</h3>
            <div className="settings-row">
              <label>Typography</label>
              <select value={typography} onChange={e => setTypography(e.target.value as any)}>
                <option value="sans">Sans-serif</option>
                <option value="serif">Serif</option>
                <option value="mono">Monospace</option>
              </select>
            </div>
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
            <h3>Editor — Behavior</h3>
            <div className="settings-row">
              <label>Auto-save</label>
              <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
            </div>
          </div>
        </section>

        <footer className="settings-footer">
          <button className="settings-btn-reset" onClick={resetSettings}>
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <button className="settings-btn-done" onClick={closeSettings}>Done</button>
        </footer>
      </div>
    </div>
  )
}
