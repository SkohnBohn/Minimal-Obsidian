import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Tab } from '../tabs/useTabs'

interface FileEntry {
  name: string
  path: string
  mtime: number
}

interface PanelEntry {
  name: string
  type: string
  open: () => void
}

interface FileSwitcherProps {
  tabs: Tab[]
  files: FileEntry[]
  panels: PanelEntry[]
  onOpen: (name: string) => void
  onClose: () => void
}

interface ResultItem {
  key: string
  label: string
  activate: () => void
}

function vaultBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 2] ?? ''
}

function buildResults(tabs: Tab[], files: FileEntry[], panels: PanelEntry[], query: string, onOpen: (name: string) => void): ResultItem[] {
  const q = query.toLowerCase()

  // Detect name collisions across vaults for hint display
  const nameCounts = new Map<string, number>()
  files.forEach(f => nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1))

  // All open tabs sorted by lastUsed descending, filtered by query
  const tabItems: ResultItem[] = [...tabs]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .filter(t => t.type === 'note' && (!q || t.name.toLowerCase().includes(q)))
    .map(t => ({ key: t.id, label: t.name, activate: () => onOpen(t.name) }))

  // Panels not already open as a tab
  const openTypes = new Set(tabs.map(t => t.type))
  const panelItems: ResultItem[] = panels
    .filter(p => !openTypes.has(p.type as Tab['type']) && (!q || p.name.toLowerCase().includes(q)))
    .map(p => ({ key: `panel:${p.type}`, label: p.name, activate: p.open }))

  // Files not already open as a tab, filtered by query
  const openPaths = new Set(tabs.map(t => t.path).filter(Boolean))
  const fileItems: ResultItem[] = files
    .filter(f => !openPaths.has(f.path) && (!q || f.name.toLowerCase().includes(q)))
    .sort((a, b) => q
      ? a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)
      : b.mtime - a.mtime
    )
    .slice(0, 20)
    .map(f => {
      const collision = (nameCounts.get(f.name) ?? 0) > 1
      const label = collision ? `${f.name}  ·  ${vaultBasename(f.path)}` : f.name
      return { key: f.path, label, activate: () => onOpen(f.name) }
    })

  return [...tabItems, ...panelItems, ...fileItems].slice(0, 20)
}

export default function FileSwitcher({ tabs, files, panels, onOpen, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  const results = buildResults(tabs, files, panels, query, onOpen)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelectedIdx(0) }, [query])
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'nearest' }) }, [selectedIdx])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = results[selectedIdx]
        if (target) {
          target.activate()
        } else if (query.trim()) {
          onOpen(query.trim())
        }
        onClose()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [results, selectedIdx, query, onOpen, onClose]
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="modal-input"
          placeholder="Open note…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-results">
          {results.map((r, i) => (
            <div
              key={r.key}
              ref={i === selectedIdx ? selectedRef : null}
              className={`modal-result${i === selectedIdx ? ' selected' : ''}`}
              onClick={() => { r.activate(); onClose() }}
            >
              {r.label}
            </div>
          ))}
          {!results.length && query && (
            <div
              className="modal-result selected"
              onClick={() => { onOpen(query.trim()); onClose() }}
            >
              Create "{query.trim()}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
