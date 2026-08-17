import React, { useState, useRef, useCallback } from 'react'

interface SearchResult {
  path: string
  name: string
  snippet: string
}

interface SearchSidebarProps {
  onOpen: (path: string, name: string) => void
}

export default function SearchSidebar({ onOpen }: SearchSidebarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) {
        setResults([])
        return
      }
      const res = await window.api.search.query(q)
      setResults(res)
    }, 120)
  }, [])

  return (
    <div className="sidebar">
      <div className="sidebar-input-wrap">
        <input
          className="sidebar-input"
          placeholder="Search notes…"
          value={query}
          onChange={handleInput}
          autoFocus
        />
      </div>
      <div className="sidebar-results">
        {results.map(r => (
          <div
            key={r.path}
            className="sidebar-result"
            onClick={() => onOpen(r.path, r.name)}
          >
            <div className="sidebar-result-title">{r.name}</div>
            <div
              className="sidebar-result-snippet"
              dangerouslySetInnerHTML={{ __html: r.snippet }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
