import { registerBuiltInCommands } from './commandHandler'

export { editorCommandsExtension, getCommands, registerCommand, parseCommandLine } from './commandSystem'
export { commandCompletionSource } from './commandAutocomplete'
export type { Command, CommandContext } from './commandSystem'

registerBuiltInCommands()
