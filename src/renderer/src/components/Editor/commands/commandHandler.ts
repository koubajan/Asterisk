import type { CommandContext } from './commandSystem'
import { registerCommand } from './commandSystem'
import { useAIChat } from '../../../store/useAIChat'
import { insertTableAtCursor } from '../keybindings'

const DEFAULT_PROMPTS: Record<string, string> = {
  improve: 'Improve this note for clarity and flow. Keep the same structure and meaning; polish wording and formatting.',
  outline: 'Suggest or add a clear outline (headings and bullet structure) for this note. Preserve existing content.',
  expand: 'Expand the key points in this note with a bit more detail. Keep the same tone and structure.',
  shorten: 'Make this note more concise. Keep the main ideas and remove redundancy.',
  tone: 'Rewrite this note in a more formal tone. Preserve all content.',
  casual: 'Rewrite this note in a more casual, friendly tone. Preserve all content.',
  ask: 'Help me with this note or documentation.'
}

function openAIWithPrompt(args: string, defaultKey: string, applyFriendly: boolean): Promise<void> {
  const custom = args.trim()
  const prompt = custom || DEFAULT_PROMPTS[defaultKey] || DEFAULT_PROMPTS.ask
  useAIChat.getState().setPendingPrompt(prompt, { applyFriendly })
  window.dispatchEvent(new CustomEvent('asterisk:open-ai'))
  return Promise.resolve()
}

export function registerBuiltInCommands(): void {
  registerCommand({
    prefix: '/',
    name: 'improve',
    description: 'Improve clarity and flow',
    execute: (args, ctx) => openAIWithPrompt(args, 'improve', true)
  })
  registerCommand({
    prefix: '/',
    name: 'outline',
    description: 'Add or suggest outline structure',
    execute: (args, ctx) => openAIWithPrompt(args, 'outline', true)
  })
  registerCommand({
    prefix: '/',
    name: 'expand',
    description: 'Expand key points with more detail',
    execute: (args, ctx) => openAIWithPrompt(args, 'expand', true)
  })
  registerCommand({
    prefix: '/',
    name: 'shorten',
    description: 'Make the note more concise',
    execute: (args, ctx) => openAIWithPrompt(args, 'shorten', true)
  })
  registerCommand({
    prefix: '/',
    name: 'tone',
    description: 'Rewrite in a more formal tone',
    execute: (args, ctx) => openAIWithPrompt(args, 'tone', true)
  })
  registerCommand({
    prefix: '/',
    name: 'casual',
    description: 'Rewrite in a casual, friendly tone',
    execute: (args, ctx) => openAIWithPrompt(args, 'casual', true)
  })
  registerCommand({
    prefix: '/',
    name: 'ask',
    description: 'Ask anything about this note',
    execute: (args, ctx) => openAIWithPrompt(args, 'ask', false)
  })
  registerCommand({
    prefix: '/',
    name: 'table',
    description: 'Insert a markdown table (e.g. 4x3 for 4 columns, 3 rows)',
    execute: (args, ctx) => {
      const match = args.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i)
      const cols = match ? Math.min(12, Math.max(2, parseInt(match[1], 10))) : 3
      const rows = match ? Math.min(20, Math.max(1, parseInt(match[2], 10))) : 2
      insertTableAtCursor(ctx.view, cols, rows)
      return Promise.resolve()
    }
  })
}
