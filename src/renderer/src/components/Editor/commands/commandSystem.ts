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

export function getLineAt(view: EditorView, pos: number): { from: number; to: number; text: string } | null {
  const doc = view.state.doc
  if (doc.length === 0) return null
  const line = doc.lineAt(Math.min(pos, doc.length - 1))
  return { from: line.from, to: line.to, text: line.text }
}

/** Execute a command for the given line and remove the line. Used when user selects a command from suggestions (click or accept). */
export function executeCommandLine(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  getCurrentFilePath: () => string | null,
  commandNameOverride?: string
): void {
  const line = view.state.doc.sliceString(lineFrom, lineTo)
  const parsed = parseCommandLine(line)
  if (!parsed) return
  const name = (commandNameOverride ?? parsed.name).toLowerCase()
  const command = commands.find((c) => c.prefix === parsed.prefix && c.name === name)
  if (!command) return

  const filePath = getCurrentFilePath()
  const fileContent = view.state.doc.toString()
  const insertResponse = (text: string) => {
    const doc = view.state.doc
    const insertPos = doc.length
    view.dispatch({
      changes: {
        from: insertPos,
        insert: (insertPos > 0 && !doc.sliceString(insertPos - 1, insertPos).endsWith('\n') ? '\n' : '') + text + '\n'
      },
      selection: EditorSelection.cursor(insertPos + text.length + 1)
    })
  }
  const context: CommandContext = { view, filePath, fileContent, insertResponse }

  Promise.resolve(command.execute(parsed.args, context)).then(() => {
    view.dispatch({
      changes: { from: lineFrom, to: Math.min(lineTo + 1, view.state.doc.length), insert: '' },
      selection: EditorSelection.cursor(lineFrom)
    })
  })
}

export function editorCommandsExtension(_getCurrentFilePath: () => string | null) {
  return keymap.of([])
}
