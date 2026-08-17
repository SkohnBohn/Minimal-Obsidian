import React, { useState, useEffect, useRef, useCallback } from 'react'

interface FileEntry {
  name: string
  path: string
}

interface FileSwitcherProps {
  files: FileEntry[]
  onOpen: (name: string) => void
  onClose: () => void
}

function fuzzyFilter(files: FileEntry[], query: string): FileEntry[] {
  if (!query) return files.slice(0, 20)
  const q = query.toLowerCase()
  return files
    .filter(f => f.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.name.toLowerCase().indexOf(q)
      const bi = b.name.toLowerCase().indexOf(q)
      return ai - bi
    })
    .slice(0, 20)
}

export default function FileSwitcher({ files, onOpen, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = fuzzyFilter(files, query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = filtered[selectedIdx]
        if (target) {
          onOpen(target.name)
        } else if (query.trim()) {
          onOpen(query.trim())
        }
        onClose()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIdx, query, onOpen, onClose]
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
          {filtered.map((f, i) => (
            <div
              key={f.path}
              className={`modal-result${i === selectedIdx ? ' selected' : ''}`}
              onClick={() => { onOpen(f.name); onClose() }}
            >
              {f.name}
            </div>
          ))}
          {!filtered.length && query && (
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
