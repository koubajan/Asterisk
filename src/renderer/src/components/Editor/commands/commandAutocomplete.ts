import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { getCommands } from './commandSystem'

/** Completion source that shows command suggestions when the user types `/` or `>` at the start of a line. */
export function commandCompletionSource(context: CompletionContext): CompletionResult | null {
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
    info: c.description,
    apply: c.name
  }))

  return {
    from: afterPrefix,
    options,
    validFor: /^\w*$/
  }
}
