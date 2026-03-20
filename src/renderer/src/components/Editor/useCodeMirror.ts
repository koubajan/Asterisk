import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { indentUnit } from '@codemirror/language'
import { useSettings } from '../../store/useSettings'
import { editorModeForCodeMirror } from './editorModeRef'
import { asteriskEditorTheme, asteriskHighlighting } from './asteriskTheme'
import { markdownKeymap } from './keybindings'
import { editorLinkClick } from './editorLinkClick'
import { autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { editorCommandsExtension, commandCompletionSource } from './commands'
import { markdownHideSyntax } from './markdownHideSyntax'

interface UseCodeMirrorOptions {
  onChange: (value: string) => void
  onSave: () => void
  /** Return current file path for resolving relative links on Cmd/Ctrl+Click. Use a ref so the extension always gets the latest. */
  getCurrentFilePath?: () => string | null
  /** Called when user presses Cmd/Ctrl+D to toggle bookmark. */
  onToggleBookmark?: () => void
}

/** Line gutter only in split view; live preview uses hide-syntax extensions (see editorModeRef). */
function lineNumbersExtForMode(editorMode: 'live-preview' | 'split-view') {
  return editorMode === 'split-view' ? lineNumbers() : []
}

function buildSettingsExtensions(lineWrapping: boolean, fontSize: number, tabSize: number) {
  const safeFontSize = Math.max(10, Math.min(24, fontSize))
  const safeTabSize = Math.max(2, Math.min(8, tabSize))
  return [
    indentUnit.of(' '.repeat(safeTabSize)),
    ...(lineWrapping ? [EditorView.lineWrapping] : []),
    EditorView.theme({
      '&': { fontSize: `${safeFontSize}px` },
      '.cm-content': { fontSize: `${safeFontSize}px` },
      '.cm-line': { lineHeight: '1.75' }
    })
  ]
}

export function useCodeMirror({ onChange, onSave, getCurrentFilePath, onToggleBookmark }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onToggleBookmarkRef = useRef(onToggleBookmark)
  const settingsCompartmentRef = useRef<Compartment | null>(null)
  const lineNumbersCompartmentRef = useRef<Compartment | null>(null)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onToggleBookmarkRef.current = onToggleBookmark

  const { lineWrapping, fontSize, tabSize, editorMode } = useSettings()

  editorModeForCodeMirror.current = editorMode

  useEffect(() => {
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

    const lineNumbersCompartment = new Compartment()
    lineNumbersCompartmentRef.current = lineNumbersCompartment

    const { lineWrapping: l, fontSize: f, tabSize: t, editorMode: m } = useSettings.getState()
    editorModeForCodeMirror.current = m
    const initialSettings = buildSettingsExtensions(l, f, t)
    const initialLineNumbers = lineNumbersExtForMode(m)

    const extensions = [
      history(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      asteriskEditorTheme,
      asteriskHighlighting,
      settingsCompartment.of(initialSettings),
      lineNumbersCompartment.of(initialLineNumbers),
      ...markdownHideSyntax,
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
      lineNumbersCompartmentRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const compartment = settingsCompartmentRef.current
    if (!view || !compartment) return
    const next = buildSettingsExtensions(lineWrapping, fontSize, tabSize)
    view.dispatch({ effects: compartment.reconfigure(next) })
  }, [lineWrapping, fontSize, tabSize])

  useEffect(() => {
    const syncFromPersistedSettings = () => {
      const view = viewRef.current
      const settingsCompartment = settingsCompartmentRef.current
      const lineCompartment = lineNumbersCompartmentRef.current
      if (!view || !settingsCompartment || !lineCompartment) return
      const { lineWrapping: lw, fontSize: fs, tabSize: ts, editorMode: em } = useSettings.getState()
      editorModeForCodeMirror.current = em
      const settingsExt = buildSettingsExtensions(lw, fs, ts)
      view.dispatch({
        effects: [
          settingsCompartment.reconfigure(settingsExt),
          lineCompartment.reconfigure(lineNumbersExtForMode(em))
        ]
      })
    }
    const unsub = useSettings.persist.onFinishHydration(syncFromPersistedSettings)
    if (useSettings.persist.hasHydrated()) syncFromPersistedSettings()
    return unsub
  }, [])

  useEffect(() => {
    editorModeForCodeMirror.current = editorMode
    const view = viewRef.current
    const lineCompartment = lineNumbersCompartmentRef.current
    if (!view || !lineCompartment) return
    view.dispatch({
      effects: [lineCompartment.reconfigure(lineNumbersExtForMode(editorMode))]
    })
  }, [editorMode])

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
