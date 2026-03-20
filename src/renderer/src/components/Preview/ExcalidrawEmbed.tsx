import { useEffect, useState, useRef } from 'react'
import { useWorkspace } from '../../store/useWorkspace'

interface ExcalidrawEmbedProps {
  relativePath: string
  currentFilePath: string
}

function resolveRelativePath(currentFile: string, relative: string): string {
  if (relative.startsWith('/')) return relative
  const dir = currentFile.substring(0, currentFile.lastIndexOf('/'))
  return dir + '/' + relative.replace(/^\.\//, '')
}

export default function ExcalidrawEmbed({ relativePath, currentFilePath }: ExcalidrawEmbedProps) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const resolvedPath = resolveRelativePath(currentFilePath, relativePath)

  useEffect(() => {
    let cancelled = false

    async function loadAndRender() {
      try {
        const result = await window.asterisk.readFile(resolvedPath)
        if (cancelled) return
        if (!result.ok || !result.data?.content) {
          setError('Could not load drawing')
          return
        }

        const data = JSON.parse(result.data.content)
        const elements = data.elements || []
        if (elements.length === 0) {
          setSvgHtml('<div style="padding:24px;color:var(--text-muted);font-size:13px;">Empty drawing</div>')
          return
        }

        const { exportToSvg } = await import('@excalidraw/excalidraw')
        const svg = await exportToSvg({
          elements,
          appState: {
            ...data.appState,
            exportWithDarkMode: true,
            exportBackground: false,
          },
          files: data.files || {},
        })
        if (cancelled) return

        setSvgHtml(svg.outerHTML)
      } catch {
        if (!cancelled) setError('Failed to render drawing')
      }
    }

    loadAndRender()
    return () => { cancelled = true }
  }, [resolvedPath])

  function handleClick() {
    const fileName = resolvedPath.split('/').pop() ?? resolvedPath
    useWorkspace.getState().openFileNode({
      kind: 'file',
      name: fileName,
      path: resolvedPath,
      children: [],
      depth: 0
    })
  }

  if (error) {
    return <div className="excalidraw-embed-error">{error}</div>
  }

  if (!svgHtml) {
    return <div className="excalidraw-embed-loading">Loading drawing...</div>
  }

  return (
    <div
      ref={containerRef}
      className="excalidraw-embed-container"
      onClick={handleClick}
      title="Click to edit drawing"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  )
}
