import React from 'react'

interface ResizeHandleProps {
  getWidth: () => number
  onChange: (width: number) => void
  direction: 'left' | 'right'  // which way dragging grows the panel
  min: number
  max: number
}

// Drag handle for a fixed-width side panel (search sidebar / backlinks
// panel). Unlike SplitDivider (which resizes a ratio between two flex
// panes), this just grows/shrinks one panel's own width.
export default function ResizeHandle({ getWidth, onChange, direction, min, max }: ResizeHandleProps) {
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = getWidth()
    const sign = direction === 'right' ? 1 : -1

    function handleMove(ev: MouseEvent) {
      const delta = (ev.clientX - startX) * sign
      onChange(Math.min(max, Math.max(min, startWidth + delta)))
    }
    function handleUp() {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return <div className="width-resize-handle" onMouseDown={handleMouseDown} />
}
