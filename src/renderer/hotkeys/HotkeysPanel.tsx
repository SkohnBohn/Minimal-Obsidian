import React from 'react'

const GROUPS: [string, [string, string][]][] = [
  ['general', [
    ['⌘O', 'open file'],
    ['⌘N', 'new note'],
    ['⌘W', 'close tab'],
    ['Esc', 'close search / switcher'],
  ]],
  ['search', [
    ['⌘F', 'find in note'],
    ['⌘⇧F', 'search notes'],
  ]],
  ['navigation', [
    ['⌘] / ⌘[', 'next / prev tab'],
    ['⌘⌥←', 'back'],
    ['⌘⌥→', 'forward'],
    ['⌘⇧G', 'graph view'],
    ['⌘,', 'settings'],
  ]],
  ['citations', [
    ['⌘⇧O', 'insert source ref'],
    ['⌘⇧P', 'add source entry'],
  ]],
]

export default function HotkeysPanel() {
  return (
    <div className="hotkeys-panel">
      {GROUPS.map(([label, rows]) => (
        <div key={label} className="hotkeys-group">
          <div className="settings-section" style={{ width: 250 }}>{label}</div>
          {rows.map(([key, desc]) => (
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
