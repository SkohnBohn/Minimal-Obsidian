import React, { useEffect, useRef, useState } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef(results)
  const onOpenRef = useRef(onOpen)

  useEffect(() => { resultsRef.current = results }, [results])
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(-1) }, [results])

  // Scroll selected result into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Global keydown handler — works regardless of focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, resultsRef.current.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setSelectedIndex(i => {
          const idx = i >= 0 ? i : 0
          const r = resultsRef.current[idx]
          if (r) onOpenRef.current(r.path, r.name)
          return i
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-input-wrap">
        <input
          ref={inputRef}
          className="sidebar-input"
          placeholder="Search notes…"
          value={query}
          onChange={e => onQuery(e.target.value)}
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
