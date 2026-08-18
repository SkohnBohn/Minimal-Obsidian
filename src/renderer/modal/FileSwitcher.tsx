import React, { useState, useEffect, useRef, useCallback } from 'react'

interface FileEntry {
  name: string
  path: string
  mtime: number
}

interface SpecialEntry {
  name: string
  onOpen: () => void
}

interface FileSwitcherProps {
  files: FileEntry[]
  specials: SpecialEntry[]
  onOpen: (name: string) => void
  onClose: () => void
}

type ResultItem =
  | { kind: 'file'; file: FileEntry }
  | { kind: 'special'; name: string; onOpen: () => void }

function buildResults(files: FileEntry[], specials: SpecialEntry[], query: string): ResultItem[] {
  const q = query.toLowerCase()

  const matchedSpecials: ResultItem[] = specials
    .filter(s => !q || s.name.toLowerCase().includes(q))
    .map(s => ({ kind: 'special', name: s.name, onOpen: s.onOpen }))

  const matchedFiles: ResultItem[] = (
    q
      ? files
          .filter(f => f.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
      : files.slice().sort((a, b) => b.mtime - a.mtime)
  )
    .slice(0, 20)
    .map(f => ({ kind: 'file', file: f }))

  return [...matchedSpecials, ...matchedFiles].slice(0, 20)
}

export default function FileSwitcher({ files, specials, onOpen, onClose }: FileSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = buildResults(files, specials, query)

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
          if (target.kind === 'special') target.onOpen()
          else onOpen(target.file.name)
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
              key={r.kind === 'file' ? r.file.path : r.name}
              className={`modal-result${i === selectedIdx ? ' selected' : ''}${r.kind === 'special' ? ' modal-result-special' : ''}`}
              onClick={() => {
                if (r.kind === 'special') r.onOpen()
                else onOpen(r.file.name)
                onClose()
              }}
            >
              {r.kind === 'file' ? r.file.name : r.name}
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
