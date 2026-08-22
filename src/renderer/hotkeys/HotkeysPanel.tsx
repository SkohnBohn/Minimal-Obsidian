import React from 'react'

const GROUPS: [string, [string, string][]][] = [
  ['general', [
    ['CMD + O', 'open file'],
    ['CMD + N', 'new note'],
    ['CMD + W', 'close tab'],
    ['ESC', 'close search / switcher'],
  ]],
  ['search', [
    ['CMD + F', 'find in note'],
    ['CMD + SHIFT + F', 'search notes'],
  ]],
  ['navigation', [
    ['CTRL + TAB / CTRL + SHIFT + TAB', 'next / prev tab'],
    ['CMD + OPT + LEFT', 'back'],
    ['CMD + OPT + RIGHT', 'forward'],
    ['CMD + SHIFT + G', 'graph view'],
    ['CMD + ,', 'settings'],
  ]],
  ['citations', [
    ['CMD + SHIFT + O', 'insert source ref'],
    ['CMD + SHIFT + P', 'add source entry'],
  ]],
]

export default function HotkeysPanel() {
  return (
    <div className="hotkeys-panel">
      {GROUPS.map(([label, rows]) => (
        <div key={label} className="hotkeys-group">
          <div className="settings-section" style={{ width: 320 }}>{label}</div>
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
