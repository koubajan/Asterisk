import { useEffect, useState } from 'react'
import './ImagePreview.css'

interface ImagePreviewProps {
  filePath: string
  fileName: string
}

/** Loads image via IPC only (no protocol) so it works in dev and prod. */
export default function ImagePreview({ filePath, fileName }: ImagePreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const path = filePath?.trim() ?? ''

  useEffect(() => {
    if (!path) {
      setDataUrl(null)
      setError('No path')
      return
    }
    setDataUrl(null)
    setError(null)
    let cancelled = false
    if (!window.asterisk?.readImageAsDataUrl) {
      setError('Not available')
      return
    }
    window.asterisk.readImageAsDataUrl(path).then((r) => {
      if (cancelled) return
      const raw = r?.ok ? r?.data?.dataUrl : null
      if (typeof raw === 'string' && raw.startsWith('data:') && raw.length > 100) {
        setDataUrl(raw)
        setError(null)
      } else {
        setError(r?.error ?? 'Failed to load')
      }
    }).catch((e) => {
      if (!cancelled) setError(e?.message ?? 'Failed to load')
    })
    return () => { cancelled = true }
  }, [path])

  if (error) {
    return (
      <div className="image-preview image-preview-error">
        <p>{error}</p>
        <span className="image-preview-path">{filePath}</span>
      </div>
    )
  }
  if (dataUrl) {
    return (
      <div className="image-preview">
        <img src={dataUrl} alt={fileName} />
      </div>
    )
  }
  return (
    <div className="image-preview image-preview-loading">
      <p>Loading image…</p>
    </div>
  )
}
