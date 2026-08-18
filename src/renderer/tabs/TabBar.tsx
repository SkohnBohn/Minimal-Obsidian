import React, { useState } from 'react'
import type { Tab } from './useTabs'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number) => void
}

export default function TabBar({ tabs, activeTabId, onActivate, onClose, onReorder }: TabBarProps) {
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragSrc(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setInsertAt(e.clientX < rect.left + rect.width / 2 ? idx : idx + 1)
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const to = e.clientX < rect.left + (e.currentTarget as HTMLElement).offsetWidth / 2 ? idx : idx + 1
    if (dragSrc !== null && to !== dragSrc && to !== dragSrc + 1) onReorder(dragSrc, to)
    setDragSrc(null)
    setInsertAt(null)
  }

  function handleDragEnd() {
    setDragSrc(null)
    setInsertAt(null)
  }

  return (
    <div className="tabbar" onDragLeave={() => setInsertAt(null)}>
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
          onClick={() => onActivate(tab.id)}
          onDragStart={e => handleDragStart(e, i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={e => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
        >
          <span className="tab-name">
            {tab.isDirty ? '· ' : ''}{tab.name}
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
