import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { indentUnit } from '@codemirror/language'
import { useSettings } from '../../store/useSettings'
import { asteriskEditorTheme, asteriskHighlighting } from './asteriskTheme'
import { markdownKeymap } from './keybindings'
import { editorLinkClick } from './editorLinkClick'
import { autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { editorCommandsExtension, commandCompletionSource } from './commands'

interface UseCodeMirrorOptions {
  onChange: (value: string) => void
  onSave: () => void
  /** Return current file path for resolving relative links on Cmd/Ctrl+Click. Use a ref so the extension always gets the latest. */
  getCurrentFilePath?: () => string | null
  /** Called when user presses Cmd/Ctrl+D to toggle bookmark. */
  onToggleBookmark?: () => void
}

function buildSettingsExtensions(lineWrapping: boolean, fontSize: number, tabSize: number) {
  const safeFontSize = Math.max(10, Math.min(24, fontSize))
  const safeTabSize = Math.max(2, Math.min(8, tabSize))
  return [
    indentUnit.of(' '.repeat(safeTabSize)),
    ...(lineWrapping ? [EditorView.lineWrapping] : []),
    EditorView.theme({ '&': { fontSize: `${safeFontSize}px` } })
  ]
}

export function useCodeMirror({ onChange, onSave, getCurrentFilePath, onToggleBookmark }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onToggleBookmarkRef = useRef(onToggleBookmark)
  const settingsCompartmentRef = useRef<Compartment | null>(null)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onToggleBookmarkRef.current = onToggleBookmark

  const { lineWrapping, fontSize, tabSize } = useSettings()

  useEffect(() => {
    // containerRef.current is always set because the div is always in the DOM
    const container = containerRef.current
    if (!container) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current()
          return true
        }
      },
      ...(onToggleBookmark
        ? [{
            key: 'Mod-d',
            run: () => {
              onToggleBookmarkRef.current?.()
              return true
            }
          }]
        : [])
    ])

    const settingsCompartment = new Compartment()
    settingsCompartmentRef.current = settingsCompartment

    const { lineWrapping: l, fontSize: f, tabSize: t } = useSettings.getState()
    const initialSettings = buildSettingsExtensions(l, f, t)

    const extensions = [
      history(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      asteriskEditorTheme,
      asteriskHighlighting,
      settingsCompartment.of(initialSettings),
      editorLinkClick(getCurrentFilePath ?? (() => null)),
      editorCommandsExtension(getCurrentFilePath ?? (() => null)),
      autocompletion({ override: [commandCompletionSource(getCurrentFilePath ?? (() => null))] }),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, ...searchKeymap]),
      markdownKeymap,
      saveKeymap,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      })
    ]

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions
      }),
      parent: container
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
      settingsCompartmentRef.current = null
    }
  // Intentionally empty — runs once on mount, container is always present
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconfigure editor when settings change
  useEffect(() => {
    const view = viewRef.current
    const compartment = settingsCompartmentRef.current
    if (!view || !compartment) return
    const next = buildSettingsExtensions(lineWrapping, fontSize, tabSize)
    view.dispatch({ effects: compartment.reconfigure(next) })
  }, [lineWrapping, fontSize, tabSize])

  const updateContent = useCallback((newContent: string) => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === newContent) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newContent }
    })
  }, [])

  return { containerRef, viewRef, updateContent }
}
