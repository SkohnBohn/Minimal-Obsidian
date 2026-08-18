import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Tab } from '../tabs/useTabs'

interface FileEntry {
  name: string
  path: string
  mtime: number
}

interface FileSwitcherProps {
  tabs: Tab[]
  files: FileEntry[]
  onActivateTab: (id: string) => void
  onOpen: (name: string) => void
  onClose: () => void
}

interface ResultItem {
  key: string
  label: string
  activate: () => void
}

function buildResults(tabs: Tab[], files: FileEntry[], query: string, onActivateTab: (id: string) => void, onOpen: (name: string) => void): ResultItem[] {
  const q = query.toLowerCase()

  // All open tabs sorted by lastUsed descending, filtered by query
  const tabItems: ResultItem[] = [...tabs]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .filter(t => !q || t.name.toLowerCase().includes(q))
    .map(t => ({ key: t.id, label: t.name, activate: () => onActivateTab(t.id) }))

  // Files not already open as a tab, filtered by query
  const openPaths = new Set(tabs.map(t => t.path).filter(Boolean))
  const fileItems: ResultItem[] = files
    .filter(f => !openPaths.has(f.path) && (!q || f.name.toLowerCase().includes(q)))
    .sort((a, b) => q
      ? a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)
      : b.mtime - a.mtime
    )
    .slice(0, 20)
    .map(f => ({ key: f.path, label: f.name, activate: () => onOpen(f.name) }))

  return [...tabItems, ...fileItems].slice(0, 20)
}

export default function FileSwitcher({ tabs, files, onActivateTab, onOpen, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = buildResults(tabs, files, query, onActivateTab, onOpen)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelectedIdx(0) }, [query])

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
