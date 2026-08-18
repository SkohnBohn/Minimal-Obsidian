import React from 'react'

const SHORTCUTS = [
  ['⌘O', 'open file'],
  ['⌘N', 'new note'],
  ['⌘W', 'close tab'],
  ['⌘F', 'search'],
  ['⌘⇧[', 'prev tab'],
  ['⌘⇧]', 'next tab'],
  ['⌘⌥←', 'back'],
  ['⌘⌥→', 'forward'],
  ['Esc', 'close modal'],
]

export default function HotkeysPanel() {
  return (
    <div className="hotkeys-panel">
      {SHORTCUTS.map(([key, desc]) => (
        <div key={key} className="hotkeys-row">
          <span className="hotkeys-key">{key}</span>
          <span className="hotkeys-desc">{desc}</span>
        </div>
      ))}
    </div>
  )
}
