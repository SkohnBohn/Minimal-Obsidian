import React, { useEffect, useState } from 'react'
import type { Tab, PaneId } from './useTabs'

const DRAG_MIME = 'application/x-minimal-obsidian-tab'

interface TabBarProps {
  paneId: PaneId
  tabs: Tab[]
  activeTabId: string | null
  isPaneFocused: boolean
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
  paneId, tabs, activeTabId, isPaneFocused, onActivate, onClose, onReorder, onMoveFromOtherPane,
  onTabDragStart, onTabDragEnd, keyboardOnly, onSettings, settingsActive
}: TabBarProps) {
  // Tracked by tab id, not array index: once a cross-pane drag moves the
  // dragged tab out of this pane entirely, it simply stops matching any tab
  // here (self-healing), instead of an index that could point at whatever
  // tab happens to now sit at that stale position.
  const [dragId, setDragId] = useState<string | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)

  // Safety net: the native 'dragend' event is only reliably delivered if the
  // dragged element is still attached to the document when it fires — a
  // cross-pane move re-renders this bar with one fewer tab before that
  // happens, detaching it, so dragend can silently never arrive and leave
  // the tab dimmed forever. 'mouseup' always fires on pointer release
  // regardless of what got unmounted in between, so it's the one thing here
  // guaranteed to clear the drag state.
  useEffect(() => {
    if (dragId === null) return
    function clear() { setDragId(null); setInsertAt(null) }
    window.addEventListener('mouseup', clear)
    return () => window.removeEventListener('mouseup', clear)
  }, [dragId])

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragId(tabs[idx].id)
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
      setDragId(null)
      setInsertAt(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const to = e.clientX < rect.left + (e.currentTarget as HTMLElement).offsetWidth / 2 ? idx : idx + 1
    const fromIdx = dragId !== null ? tabs.findIndex(t => t.id === dragId) : -1
    if (fromIdx !== -1 && to !== fromIdx && to !== fromIdx + 1) onReorder(fromIdx, to)
    setDragId(null)
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
    setDragId(null)
    setInsertAt(null)
  }

  function handleDragEnd() {
    setDragId(null)
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
            tab.id === activeTabId && !isPaneFocused ? 'pane-unfocused' : '',
            insertAt === i ? 'tab-insert-before' : '',
            insertAt === i + 1 && i === tabs.length - 1 ? 'tab-insert-after' : '',
          ].filter(Boolean).join(' ')}
          style={{ opacity: tab.id === dragId ? 0.35 : 1 }}
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
