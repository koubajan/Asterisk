/**
 * Builds an asterisk-file:// URL for use in <img src> so the main process
 * serves the file via the custom protocol. Uses a dummy host "local" so
 * pathname is never parsed as the host (e.g. "Users" on macOS).
 */
export function asteriskFileUrl(absolutePath: string): string {
  if (!absolutePath?.trim()) return ''
  const p = absolutePath.trim().replace(/\\/g, '/')
  const segments = p.split('/').filter(Boolean)
  const pathname = '/' + segments.map((s) => encodeURIComponent(s)).join('/')
  return 'asterisk-file://local' + pathname
}
