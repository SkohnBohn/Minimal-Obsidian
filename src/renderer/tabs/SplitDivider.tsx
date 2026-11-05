import React, { useRef } from 'react'

interface SplitDividerProps {
  containerRef: React.RefObject<HTMLElement>
  ratio: number
  onChange: (ratio: number) => void
}

const MIN_PANE_FRACTION = 0.2  // keeps either pane from being crushed to nothing

export default function SplitDivider({ containerRef, ratio, onChange }: SplitDividerProps) {
  const dragging = useRef(false)

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function handleMouseMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const raw = (ev.clientX - rect.left) / rect.width
      onChange(Math.min(1 - MIN_PANE_FRACTION, Math.max(MIN_PANE_FRACTION, raw)))
    }
    function handleMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return <div className="split-divider" onMouseDown={handleMouseDown} />
}
