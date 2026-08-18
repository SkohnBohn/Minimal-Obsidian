import React from 'react'

const GROUPS = [
  [
    ['⌘O', 'open file'],
    ['⌘N', 'new note'],
    ['⌘W', 'close tab'],
    ['Esc', 'close modal'],
  ],
  [
    ['⌘F', 'find in note'],
    ['⌘⇧F', 'search notes'],
  ],
  [
    ['⇧⌥←', 'prev tab'],
    ['⇧⌥→', 'next tab'],
    ['⌘⌥←', 'back'],
    ['⌘⌥→', 'forward'],
  ],
  [
    ['⌘⇧O', 'insert source ref'],
    ['⌘⇧P', 'add source entry'],
  ],
]

export default function HotkeysPanel() {
  return (
    <div className="hotkeys-panel">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="hotkeys-group">
          {group.map(([key, desc]) => (
            <div key={key} className="hotkeys-row">
              <span className="hotkeys-key">{key}</span>
              <span className="hotkeys-desc">{desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
