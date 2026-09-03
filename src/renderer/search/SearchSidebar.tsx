import React, { useCallback, useEffect, useRef, useState } from 'react'

interface SearchResult {
  path: string
  name: string
  snippets: string[]
}

interface SearchSidebarProps {
  query: string
  results: SearchResult[]
  onQuery: (q: string) => void
  onOpen: (path: string, name: string) => void
}

export default function SearchSidebar({ query, results, onQuery, onOpen }: SearchSidebarProps) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const selectedRef = useRef<HTMLDivElement>(null)

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(-1) }, [results])

  // Scroll selected result into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onQuery(e.target.value)
  }, [onQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = selectedIndex >= 0 ? selectedIndex : 0
      const r = results[idx]
      if (r) onOpen(r.path, r.name)
    }
  }, [results, selectedIndex, onOpen])

  return (
    <div className="sidebar">
      <div className="sidebar-input-wrap">
        <input
          className="sidebar-input"
          placeholder="Search notes…"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoFocus
          onFocus={e => e.target.select()}
        />
      </div>
      <div className="sidebar-results">
        {results.map((r, i) => (
          <div
            key={r.path}
            ref={i === selectedIndex ? selectedRef : undefined}
            className="sidebar-result"
            data-selected={i === selectedIndex ? 'true' : undefined}
            onClick={() => onOpen(r.path, r.name)}
          >
            <div className="sidebar-result-title">{r.name}</div>
            {r.snippets.map((s, j) => (
              <div
                key={j}
                className="sidebar-result-snippet"
                dangerouslySetInnerHTML={{ __html: s }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
