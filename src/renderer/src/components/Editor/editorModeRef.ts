import type { EditorMode } from '../../store/useSettings'

/**
 * React updates this every render; CodeMirror extensions read it so live-preview
 * (hide syntax) stays in sync even if compartment reconfigure were ever skipped.
 */
export const editorModeForCodeMirror: { current: EditorMode } = { current: 'live-preview' }

export function isLivePreviewMode(): boolean {
  return editorModeForCodeMirror.current === 'live-preview'
}
