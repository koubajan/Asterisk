import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const asteriskEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-editor)',
      color: '#e0e0e0',
      height: '100%',
      fontSize: '14px',
      fontFamily: 'var(--font-mono)'
    },
    '.cm-content': {
      padding: '24px 32px',
      caretColor: 'var(--accent)',
      maxWidth: '760px',
      margin: '0 auto'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-line': {
      lineHeight: '1.75'
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(255, 255, 255, 0.12) !important'
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(255, 255, 255, 0.18) !important'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-editor)',
      color: '#555555',
      border: 'none',
      paddingRight: '8px',
      display: 'none' // hide line numbers for clean writing feel
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.02)'
    },
    // Hide markdown control syntax; no layout space when hidden (revealed by cursor/hover proximity)
    '.cm-md-hidden': {
      display: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      height: '100%'
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)'
    },
    /* Command autocomplete — cleaner list and selection */
    '.cm-tooltip-autocomplete': {
      padding: '6px 0',
      borderRadius: 'var(--radius)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
    },
    '.cm-tooltip-autocomplete ul': {
      maxHeight: '280px',
      padding: '0'
    },
    '.cm-tooltip-autocomplete li': {
      padding: '6px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      borderRadius: '4px',
      margin: '0 4px'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      background: 'var(--accent-dim)',
      color: 'var(--text-primary)'
    },
    '.cm-completionLabel': {
      fontWeight: '500',
      fontSize: '13px'
    },
    '.cm-completionDetail': {
      marginLeft: 'auto',
      fontSize: '12px',
      color: 'var(--text-muted)',
      maxWidth: '180px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail': {
      color: 'var(--text-secondary)'
    },
    '.cm-completionIcon-keyword::before': {
      display: 'none'
    },
    '.cm-completionIcon-keyword': {
      display: 'none'
    },
    '.cm-completionInfo': {
      padding: '8px 12px',
      maxWidth: '280px',
      fontSize: '12px',
      lineHeight: '1.45',
      color: 'var(--text-secondary)',
      background: 'var(--bg-base)',
      borderLeft: '1px solid var(--border)',
      borderRadius: '0 var(--radius) var(--radius) 0'
    },
    '.cm-completionSectionLabel': {
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--text-muted)',
      padding: '6px 12px 4px',
      marginTop: '4px'
    },
    '.cm-completionSectionLabel:first-child': {
      marginTop: 0
    }
  },
  { dark: true }
)

export const asteriskHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    // Headings
    { tag: t.heading1, color: '#ffffff', fontWeight: '700', fontSize: '1.5em' },
    { tag: t.heading2, color: '#f0f0f0', fontWeight: '600', fontSize: '1.3em' },
    { tag: t.heading3, color: '#e8e8e8', fontWeight: '600', fontSize: '1.15em' },
    { tag: [t.heading4, t.heading5, t.heading6], color: '#cccccc', fontWeight: '600' },

    // Emphasis
    { tag: t.strong, color: '#ffffff', fontWeight: '700' },
    { tag: t.emphasis, color: '#e0e0e0', fontStyle: 'italic' },
    { tag: t.strikethrough, color: '#777777', textDecoration: 'line-through' },

    // Links
    { tag: t.link, color: '#8ab4f8', textDecoration: 'underline' },
    { tag: t.url, color: '#aaaaaa' },

    // Code
    { tag: t.monospace, color: '#c8c8c8', fontFamily: 'var(--font-mono)' },
    { tag: t.string, color: '#c8c8c8' },

    // Lists
    { tag: t.list, color: '#e0e0e0' },
    { tag: t.quote, color: '#999999', fontStyle: 'italic' },

    // Punctuation & meta
    { tag: t.processingInstruction, color: '#666666' },
    { tag: t.comment, color: '#666666', fontStyle: 'italic' },
    { tag: t.meta, color: '#666666' },
    { tag: t.invalid, color: '#ef4444' },

    // Keywords and other
    { tag: t.keyword, color: '#e0e0e0' },
    { tag: t.operator, color: '#999999' },
    { tag: t.number, color: '#c8c8c8' },
    { tag: t.bool, color: '#e0e0e0' },
    { tag: t.null, color: '#777777' },
    { tag: t.className, color: '#e0e0e0' },
    { tag: t.function(t.variableName), color: '#c8c8c8' },
    { tag: t.definition(t.variableName), color: '#c8c8c8' },
    { tag: t.typeName, color: '#e0e0e0' },
    { tag: t.propertyName, color: '#c8c8c8' }
  ])
)
