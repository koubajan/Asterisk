import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { getCommands, getLineAt, executeCommandLine } from './commandSystem'

/** Completion source that shows command suggestions when the user types `/` or `>` at the start of a line. Triggers on click (or accept); Enter no longer runs command. */
export function commandCompletionSource(getCurrentFilePath: () => string | null) {
  return function source(context: CompletionContext): CompletionResult | null {
    const line = context.state.doc.lineAt(context.pos)
    const lineText = line.text
    const slashMatch = lineText.match(/^\s*\/\s*/)
    const promptMatch = lineText.match(/^\s*>\s*/)
    const prefixMatch = slashMatch ?? promptMatch
    const prefix = slashMatch ? '/' : promptMatch ? '>' : null
    if (!prefixMatch || prefix === null) return null

    const afterPrefix = line.from + prefixMatch[0].length
    if (context.pos < afterPrefix && !context.explicit) return null

    const commands = getCommands().filter((c) => c.prefix === prefix)
    if (commands.length === 0) return null

    const sectionName = prefix === '/' ? 'Slash commands' : 'Prompt commands'
    const options = commands.map((c) => ({
      label: c.name,
      type: 'keyword' as const,
      detail: c.description,
      section: sectionName,
      apply: (view: import('@codemirror/view').EditorView, _completion: { label: string }, from: number) => {
        const lineAt = getLineAt(view, from)
        if (!lineAt) return
        executeCommandLine(view, lineAt.from, lineAt.to, getCurrentFilePath, c.name)
      }
    }))

    return {
      from: afterPrefix,
      options,
      validFor: /^\w*$/
    }
  }
}
