import React, { useState } from 'react'

const DRAG_MIME = 'application/x-minimal-obsidian-tab'

interface EdgeDropZonesProps {
  active: boolean  // a tab drag is currently in progress
  onDropSide: (tabId: string, side: 'left' | 'right') => void
}

// Thin, invisible-until-hovered strips along the window's left/right edges.
// Only mounted while a tab is actually being dragged (controlled by `active`
// from the app level) and only when not already split — once split, moving a
// tab between panes goes through the normal tab-bar drop targets instead.
export default function EdgeDropZones({ active, onDropSide }: EdgeDropZonesProps) {
  const [hover, setHover] = useState<'left' | 'right' | null>(null)

  if (!active) return null

  function zoneProps(side: 'left' | 'right') {
    return {
      className: `split-drop-zone split-drop-zone-${side}${hover === side ? ' split-drop-zone-hover' : ''}`,
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setHover(side)
      },
      onDragLeave: () => setHover(h => (h === side ? null : h)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        const raw = e.dataTransfer.getData(DRAG_MIME)
        setHover(null)
        if (!raw) return
        const { tabId } = JSON.parse(raw) as { tabId: string }
        onDropSide(tabId, side)
      }
    }
  }

  return (
    <>
      <div {...zoneProps('left')} />
      <div {...zoneProps('right')} />
    </>
  )
}
