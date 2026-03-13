import { useRef, useCallback } from 'react'
import { useArtifacts } from '../../store/useArtifacts'

export function useCanvas(containerRef: React.RefObject<HTMLDivElement | null>) {
  const setViewport = useArtifacts((s) => s.setViewport)
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const { data } = useArtifacts.getState()
      const next = Math.max(0.2, Math.min(2, data.viewport.zoom + delta))
      setViewport({ zoom: next })
    },
    [setViewport]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const { data } = useArtifacts.getState()
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        vx: data.viewport.x,
        vy: data.viewport.y
      }
      containerRef.current?.setPointerCapture(e.pointerId)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panStart.current) return
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setViewport({
        x: panStart.current.vx + dx,
        y: panStart.current.vy + dy
      })
    },
    [setViewport]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      panStart.current = null
      containerRef.current?.releasePointerCapture(e.pointerId)
    }
  }, [])

  return { handleWheel, handlePointerDown, handlePointerMove, handlePointerUp }
}
