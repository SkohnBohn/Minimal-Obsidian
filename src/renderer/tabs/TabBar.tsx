import React from 'react'
import type { Tab } from './useTabs'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

export default function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  return (
    <div className="tabbar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab${tab.id === activeTabId ? ' active' : ''}`}
          onClick={() => onActivate(tab.id)}
        >
          <span className="tab-name">
            {tab.isDirty ? '· ' : ''}{tab.name}
          </span>
          <button
            className="tab-close"
            onClick={e => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
