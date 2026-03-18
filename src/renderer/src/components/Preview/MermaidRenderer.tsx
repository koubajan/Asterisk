import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    fontFamily: 'var(--font-mono, monospace)',
    themeVariables: {
      primaryColor: '#3b82f6',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#60a5fa',
      lineColor: '#6b7280',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
      background: '#0f172a',
      mainBkg: '#1e293b',
      secondBkg: '#334155',
      nodeBorder: '#475569',
      clusterBkg: '#1e293b',
      clusterBorder: '#475569',
      titleColor: '#f1f5f9',
      edgeLabelBackground: '#1e293b',
      textColor: '#e2e8f0',
      nodeTextColor: '#f1f5f9'
    }
  })
  mermaidInitialized = true
}

interface MermaidBlockProps {
  id: string
  code: string
}

export function MermaidBlock({ id, code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    initMermaid()
    let cancelled = false

    async function render() {
      try {
        const isValid = await mermaid.parse(code)
        if (!isValid) {
          if (!cancelled) setError('Invalid Mermaid syntax')
          return
        }
        const { svg: renderedSvg } = await mermaid.render(id, code)
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Invalid Mermaid syntax')
          setSvg(null)
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [id, code])

  if (error) {
    return (
      <div className="mermaid-container mermaid-error">
        <div className="mermaid-error-icon">⚠</div>
        <div className="mermaid-error-text">{error}</div>
      </div>
    )
  }

  if (svg) {
    return (
      <div
        ref={containerRef}
        className="mermaid-container"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  return (
    <div ref={containerRef} className="mermaid-container mermaid-loading">
      <div className="mermaid-loading-text">Loading diagram...</div>
    </div>
  )
}

export function extractMermaidBlocks(content: string): { code: string; id: string }[] {
  const blocks: { code: string; id: string }[] = []
  const regex = /```mermaid\s*\n([\s\S]*?)```/g
  let match
  let index = 0

  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      code: match[1].trim(),
      id: `mermaid-${index}-${Date.now()}`
    })
    index++
  }

  return blocks
}
