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

// One flat, keyboard-navigable unit per snippet — so arrow keys step through
// every individual match, not just every file.
interface FlatEntry { resultIndex: number; snippetIndex: number }

function flattenEntries(results: SearchResult[]): FlatEntry[] {
  const out: FlatEntry[] = []
  results.forEach((r, resultIndex) => {
    r.snippets.forEach((_, snippetIndex) => out.push({ resultIndex, snippetIndex }))
  })
  return out
}

export default function SearchSidebar({ query, results, onQuery, onOpen }: SearchSidebarProps) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const selectedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef(results)
  const onOpenRef = useRef(onOpen)
  const entriesRef = useRef<FlatEntry[]>([])

  useEffect(() => { resultsRef.current = results }, [results])
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => { entriesRef.current = flattenEntries(results) }, [results])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(-1) }, [results])

  // Scroll selected result into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Global keydown handler — works regardless of focus.
  // Three navigation tiers: plain arrows step entry by entry, Option/Alt+arrow
  // jumps file by file, Cmd/Ctrl+arrow jumps to the very top/bottom entry.
  // Cmd/Ctrl+Right hands off to the backlinks panel, when it's open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement
      // Only handle navigation keys when the search input is focused
      if (active !== inputRef.current) {
        // Still allow ArrowRight from settings → search (handled below)
        return
      }
      const meta = e.metaKey || e.ctrlKey
      const alt = e.altKey

      if (e.key === 'ArrowRight' && meta) {
        const panel = document.querySelector<HTMLElement>('.backlinks-panel')
        if (panel) { e.preventDefault(); panel.focus() }
        return
      }
      if (e.key === 'ArrowDown' && meta) {
        e.preventDefault()
        setSelectedIndex(entriesRef.current.length - 1)
        return
      }
      if (e.key === 'ArrowUp' && meta) {
        e.preventDefault()
        setSelectedIndex(entriesRef.current.length ? 0 : -1)
        return
      }
      if (e.key === 'ArrowDown' && alt) {
        // Jump to the next file's first entry, regardless of how many matches
        // the current file has.
        e.preventDefault()
        setSelectedIndex(i => {
          const entries = entriesRef.current
          const curRi = i >= 0 ? entries[i].resultIndex : -1
          const next = entries.findIndex(en => en.resultIndex === curRi + 1)
          return next === -1 ? i : next
        })
        return
      }
      if (e.key === 'ArrowUp' && alt) {
        e.preventDefault()
        setSelectedIndex(i => {
          const entries = entriesRef.current
          const curRi = i >= 0 ? entries[i].resultIndex : -1
          if (curRi <= 0) return i
          const prev = entries.findIndex(en => en.resultIndex === curRi - 1)
          return prev === -1 ? i : prev
        })
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, entriesRef.current.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, -1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        setSelectedIndex(i => {
          const idx = i >= 0 ? i : 0
          const entry = entriesRef.current[idx]
          const r = entry ? resultsRef.current[entry.resultIndex] : resultsRef.current[0]
          if (r) onOpenRef.current(r.path, r.name)
          return i
        })
        return
      }
      if (e.key === 'ArrowRight' && active === inputRef.current) {
        const inp = inputRef.current!
        const atEnd = inp.selectionStart === inp.value.length &&
                      inp.selectionStart === inp.selectionEnd
        if (atEnd) {
          e.preventDefault()
          const first = document.querySelector<HTMLElement>(
            '.settings-panel button, .settings-panel input[type="checkbox"]'
          )
          first?.focus()
        }
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
          onFocus={e => {
            e.target.select()
            setSelectedIndex(i => (i === -1 && entriesRef.current.length ? 0 : i))
          }}
        />
      </div>
      <div className="sidebar-results">
        {(() => {
          let flatIdx = -1
          return results.map(r => (
            <div
              key={r.path}
              className="sidebar-result"
              onClick={() => onOpen(r.path, r.name)}
            >
              <div className="sidebar-result-title">{r.name}</div>
              {r.snippets.map((s, j) => {
                flatIdx++
                const idx = flatIdx
                return (
                  <div
                    key={j}
                    ref={idx === selectedIndex ? selectedRef : undefined}
                    className="sidebar-result-snippet"
                    data-selected={idx === selectedIndex ? 'true' : undefined}
                    dangerouslySetInnerHTML={{ __html: s }}
                  />
                )
              })}
            </div>
          ))
        })()}
      </div>
    </div>
  )
}
