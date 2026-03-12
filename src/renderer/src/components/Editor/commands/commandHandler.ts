import type { Command, CommandContext } from './commandSystem'
import { registerCommand, getCommands } from './commandSystem'

function helpCommand(_args: string, context: CommandContext): Promise<void> {
  const lines = getCommands().map((c) => `  ${c.prefix}${c.name} — ${c.description}`)
  context.insertResponse('**Available commands:**\n' + lines.join('\n'))
  return Promise.resolve()
}

function dateCommand(_args: string, context: CommandContext): Promise<void> {
  const date = new Date()
  const formatted = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  context.insertResponse(formatted)
  return Promise.resolve()
}

function wordCountCommand(_args: string, context: CommandContext): Promise<void> {
  const text = context.fileContent.replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').length : 0
  const chars = context.fileContent.length
  context.insertResponse(`Words: ${words} · Characters: ${chars}`)
  return Promise.resolve()
}

function timeCommand(_args: string, context: CommandContext): Promise<void> {
  const date = new Date()
  const formatted = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  context.insertResponse(formatted)
  return Promise.resolve()
}

function randomCommand(args: string, context: CommandContext): Promise<void> {
  const parts = args.split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10))
  let min = 0
  let max = 100
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    min = Math.min(parts[0], parts[1])
    max = Math.max(parts[0], parts[1])
  } else if (parts.length === 1 && !Number.isNaN(parts[0])) {
    max = parts[0]
  }
  const value = min + Math.floor(Math.random() * (max - min + 1))
  context.insertResponse(String(value))
  return Promise.resolve()
}

function uuidCommand(_args: string, context: CommandContext): Promise<void> {
  const uuid = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
  context.insertResponse(uuid)
  return Promise.resolve()
}

function todoCommand(_args: string, context: CommandContext): Promise<void> {
  context.insertResponse('- [ ] ')
  return Promise.resolve()
}

function tableCommand(_args: string, context: CommandContext): Promise<void> {
  const template = `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
|          |          |          |`
  context.insertResponse(template)
  return Promise.resolve()
}

export function registerBuiltInCommands(): void {
  registerCommand({
    prefix: '>',
    name: 'help',
    description: 'List available commands',
    execute: helpCommand
  })
  registerCommand({
    prefix: '>',
    name: 'date',
    description: 'Insert current date',
    execute: dateCommand
  })
  registerCommand({
    prefix: '>',
    name: 'wordcount',
    description: 'Insert word and character count',
    execute: wordCountCommand
  })
  registerCommand({
    prefix: '/',
    name: 'time',
    description: 'Insert current time',
    execute: timeCommand
  })
  registerCommand({
    prefix: '/',
    name: 'random',
    description: 'Insert random number (optional: min max)',
    execute: randomCommand
  })
  registerCommand({
    prefix: '/',
    name: 'uuid',
    description: 'Insert a UUID',
    execute: uuidCommand
  })
  registerCommand({
    prefix: '/',
    name: 'todo',
    description: 'Insert a todo checkbox',
    execute: todoCommand
  })
  registerCommand({
    prefix: '/',
    name: 'table',
    description: 'Insert markdown table template',
    execute: tableCommand
  })
}
