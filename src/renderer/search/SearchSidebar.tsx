import React, { useCallback } from 'react'

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
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onQuery(e.target.value)
  }, [onQuery])

  return (
    <div className="sidebar">
      <div className="sidebar-input-wrap">
        <input
          className="sidebar-input"
          placeholder="Search notes…"
          value={query}
          onChange={handleInput}
          autoFocus
          // Select all on reopen so user can type over the previous query
          onFocus={e => e.target.select()}
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
            {r.snippets.map((s, i) => (
              <div
                key={i}
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
