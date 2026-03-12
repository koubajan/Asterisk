import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { keymap } from '@codemirror/view'

export interface CommandContext {
  view: EditorView
  filePath: string | null
  fileContent: string
  /** Insert text at the end of the document (after the command line is removed). */
  insertResponse: (text: string) => void
}

export interface Command {
  prefix: string
  name: string
  description: string
  execute: (args: string, context: CommandContext) => Promise<void>
}

const COMMAND_LINE = /^\s*([>\/])([a-zA-Z0-9]+)\s*(.*)$/

const commands: Command[] = []

export function registerCommand(command: Command): void {
  if (!commands.some((c) => c.prefix === command.prefix && c.name === command.name)) {
    commands.push(command)
  }
}

export function getCommands(): Command[] {
  return [...commands]
}

export function parseCommandLine(line: string): { prefix: string; name: string; args: string } | null {
  const m = line.match(COMMAND_LINE)
  if (!m) return null
  return { prefix: m[1], name: m[2].toLowerCase(), args: (m[3] ?? '').trim() }
}

function getLineAt(view: EditorView, pos: number): { from: number; to: number; text: string } | null {
  const doc = view.state.doc
  if (doc.length === 0) return null
  const line = doc.lineAt(Math.min(pos, doc.length - 1))
  return { from: line.from, to: line.to, text: line.text }
}

export function editorCommandsExtension(getCurrentFilePath: () => string | null) {
  return keymap.of([
    {
      key: 'Enter',
      run(view: EditorView): boolean {
        const pos = view.state.selection.main.head
        const line = getLineAt(view, pos)
        if (!line) return false
        const parsed = parseCommandLine(line.text)
        if (!parsed) return false

        const command = commands.find(
          (c) => c.prefix === parsed.prefix && c.name === parsed.name.toLowerCase()
        )
        if (!command) return false

        const filePath = getCurrentFilePath()
        const fileContent = view.state.doc.toString()

        const insertResponse = (text: string) => {
          const doc = view.state.doc
          const insertPos = doc.length
          view.dispatch({
            changes: { from: insertPos, insert: (insertPos > 0 && !doc.sliceString(insertPos - 1, insertPos).endsWith('\n') ? '\n' : '') + text + '\n' },
            selection: EditorSelection.cursor(insertPos + text.length + 1)
          })
        }

        const context: CommandContext = {
          view,
          filePath,
          fileContent,
          insertResponse
        }

        Promise.resolve(command.execute(parsed.args, context)).then(() => {
          view.dispatch({
            changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length), insert: '' },
            selection: EditorSelection.cursor(line.from)
          })
        })

        return true
      }
    }
  ])
}
