import React, { useState } from 'react'
import type { Tab, PaneId } from './useTabs'

const DRAG_MIME = 'application/x-minimal-obsidian-tab'

interface TabBarProps {
  paneId: PaneId
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number) => void
  onMoveFromOtherPane: (tabId: string) => void
  onTabDragStart?: (tabId: string) => void
  onTabDragEnd?: () => void
  keyboardOnly?: boolean
  onSettings?: () => void
  settingsActive?: boolean
}

export default function TabBar({
  paneId, tabs, activeTabId, onActivate, onClose, onReorder, onMoveFromOtherPane,
  onTabDragStart, onTabDragEnd, keyboardOnly, onSettings, settingsActive
}: TabBarProps) {
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragSrc(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ tabId: tabs[idx].id, paneId }))
    onTabDragStart?.(tabs[idx].id)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setInsertAt(e.clientX < rect.left + rect.width / 2 ? idx : idx + 1)
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.stopPropagation()  // otherwise this bubbles to the bar's own onDrop and fires the move twice
    const raw = e.dataTransfer.getData(DRAG_MIME)
    const payload = raw ? JSON.parse(raw) as { tabId: string; paneId: PaneId } : null
    if (payload && payload.paneId !== paneId) {
      // Dragged in from the other pane — move it here, land it at this slot.
      onMoveFromOtherPane(payload.tabId)
      setDragSrc(null)
      setInsertAt(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const to = e.clientX < rect.left + (e.currentTarget as HTMLElement).offsetWidth / 2 ? idx : idx + 1
    if (dragSrc !== null && to !== dragSrc && to !== dragSrc + 1) onReorder(dragSrc, to)
    setDragSrc(null)
    setInsertAt(null)
  }

  function handleBarDragOver(e: React.DragEvent) {
    // Lets a drag from the other (possibly empty) pane be dropped on empty
    // bar space, not just directly on an existing tab.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleBarDrop(e: React.DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_MIME)
    const payload = raw ? JSON.parse(raw) as { tabId: string; paneId: PaneId } : null
    if (payload && payload.paneId !== paneId) onMoveFromOtherPane(payload.tabId)
    setDragSrc(null)
    setInsertAt(null)
  }

  function handleDragEnd() {
    setDragSrc(null)
    setInsertAt(null)
    onTabDragEnd?.()
  }

  return (
    <div
      className="tabbar"
      onDragLeave={() => setInsertAt(null)}
      onDragOver={handleBarDragOver}
      onDrop={handleBarDrop}
    >
      {onSettings && (
        <button
          className={`tabbar-settings-btn${settingsActive ? ' active' : ''}`}
          onClick={onSettings}
        >◎</button>
      )}
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          className={[
            'tab',
            tab.id === activeTabId ? 'active' : '',
            insertAt === i ? 'tab-insert-before' : '',
            insertAt === i + 1 && i === tabs.length - 1 ? 'tab-insert-after' : '',
          ].filter(Boolean).join(' ')}
          style={{ opacity: dragSrc === i ? 0.35 : 1 }}
          draggable
          onClick={keyboardOnly ? undefined : () => onActivate(tab.id)}
          onDragStart={e => handleDragStart(e, i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={e => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
        >
          <span className="tab-name">
            <span className="tab-dirty-dot" style={{ visibility: tab.isDirty ? 'visible' : 'hidden' }}>· </span>
            {tab.name}
          </span>
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); onClose(tab.id) }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
