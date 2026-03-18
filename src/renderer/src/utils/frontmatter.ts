/** Simple YAML frontmatter parse/serialize for scheduled and other fields */

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/

export interface ParsedFrontmatter {
  frontmatter: Record<string, string>
  body: string
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const m = content.match(FRONTMATTER_REGEX)
  if (!m) return { frontmatter: {}, body: content }
  const block = m[1]
  const body = m[2]
  const frontmatter: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    frontmatter[key] = value
  }
  return { frontmatter, body }
}

export function serializeFrontmatter(frontmatter: Record<string, string>, body: string): string {
  const entries = Object.entries(frontmatter).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return body
  const lines = entries.map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

export function getScheduled(parsed: ParsedFrontmatter): string | null {
  const v = parsed.frontmatter.scheduled
  return v && v.trim() ? v.trim() : null
}

export function setScheduled(parsed: ParsedFrontmatter, dateIso: string | null, reminder?: string | null): ParsedFrontmatter {
  const next = { ...parsed.frontmatter }
  if (dateIso) next.scheduled = dateIso
  else delete next.scheduled
  if (reminder) next.reminder = reminder
  else delete next.reminder
  return { frontmatter: next, body: parsed.body }
}

export function getReminder(parsed: ParsedFrontmatter): string | null {
  const v = parsed.frontmatter.reminder
  return v && v.trim() ? v.trim() : null
}
