import React, { useEffect, useRef, useState } from 'react'

interface SnippetSpan { html: string; from: number; to: number }
interface BacklinkGroup {
  name: string
  path: string
  snippets: SnippetSpan[]
}

interface BacklinksPanelProps {
  linked: BacklinkGroup[]
  unlinked: BacklinkGroup[]
  open: boolean
  onToggleOpen: () => void
  onOpen: (path: string, name: string, newTab: boolean, pos?: number) => void
}

// One flat, keyboard-navigable unit per snippet, mirroring the search
// sidebar's model — "group" here plays the role "file" plays there.
interface FlatEntry { groupIndex: number; snippetIndex: number }

function flattenEntries(groups: BacklinkGroup[]): FlatEntry[] {
  const out: FlatEntry[] = []
  groups.forEach((g, groupIndex) => {
    g.snippets.forEach((_, snippetIndex) => out.push({ groupIndex, snippetIndex }))
  })
  return out
}

function stripTags(html: string): string {
  return html.replace(/<\/?[^>]+>/g, '')
}

// Client-side filter over the already-fetched backlinks — no IPC round trip.
// A group survives if its name matches (then it keeps all its snippets) or
// if any individual snippet's text matches (then only those snippets show).
function filterGroups(groups: BacklinkGroup[], query: string): BacklinkGroup[] {
  if (!query.trim()) return groups
  const q = query.toLowerCase()
  const out: BacklinkGroup[] = []
  for (const g of groups) {
    if (g.name.toLowerCase().includes(q)) { out.push(g); continue }
    const matching = g.snippets.filter(s => stripTags(s.html).toLowerCase().includes(q))
    if (matching.length) out.push({ ...g, snippets: matching })
  }
  return out
}

function Group({ group, muted, startIndex, selectedIndex, selectedRef, onOpen, onHoverEntry }: {
  group: BacklinkGroup
  muted: boolean
  startIndex: number
  selectedIndex: number
  selectedRef: React.RefObject<HTMLDivElement>
  onOpen: BacklinksPanelProps['onOpen']
  onHoverEntry: (idx: number) => void
}) {
  return (
    <div className={muted ? 'backlink-group backlink-group-muted' : 'backlink-group'}>
      <div
        className="backlink-group-title"
        onClick={e => onOpen(group.path, group.name, e.metaKey || e.ctrlKey, group.snippets[0]?.from)}
      >
        {group.name}
      </div>
      {group.snippets.map((s, i) => {
        const idx = startIndex + i
        return (
          <div
            key={i}
            ref={idx === selectedIndex ? selectedRef : undefined}
            className="backlink-snippet"
            data-selected={idx === selectedIndex ? 'true' : undefined}
            onMouseEnter={() => onHoverEntry(idx)}
            onClick={e => onOpen(group.path, group.name, e.metaKey || e.ctrlKey, s.from)}
            dangerouslySetInnerHTML={{ __html: s.html }}
          />
        )
      })}
    </div>
  )
}

export default function BacklinksPanel({ linked, unlinked, open, onToggleOpen, onOpen }: BacklinksPanelProps) {
  const [filterQuery, setFilterQuery] = useState('')
  const shownLinked = filterGroups(linked, filterQuery)
  const shownUnlinked = filterGroups(unlinked, filterQuery)
  const allGroups = [...shownLinked, ...shownUnlinked]

  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<FlatEntry[]>([])
  const groupsRef = useRef<BacklinkGroup[]>([])
  const onOpenRef = useRef(onOpen)

  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => {
    groupsRef.current = allGroups
    entriesRef.current = flattenEntries(allGroups)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLinked, shownUnlinked])

  // Focus the filter input when the panel is explicitly toggled open (e.g.
  // Cmd/Ctrl+Shift+B), so arrow keys (and typing) work immediately — but not
  // on an incidental re-render where `open` was already true (switching
  // notes while the panel stays open).
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (open && !prevOpenRef.current) inputRef.current?.focus()
    prevOpenRef.current = open
  }, [open])

  // Reset selection and any filter text when the note (and so its backlinks) changes
  useEffect(() => { setSelectedIndex(-1); setFilterQuery('') }, [linked, unlinked])

  const suppressScrollRef = useRef(false)
  useEffect(() => {
    if (suppressScrollRef.current) { suppressScrollRef.current = false; return }
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Hovering an entry selects it, same as arrow keys would — so there's only
  // ever one selected/bordered entry. Moving the mouse off the list leaves
  // the selection on whatever was last hovered; arrow keys continue from there.
  // It also claims focus for this pane — hovering backlinks while search
  // currently "owns" the arrow keys hands them back to backlinks.
  function handleHoverEntry(idx: number) {
    if (idx !== selectedIndex) {
      suppressScrollRef.current = true
      setSelectedIndex(idx)
    }
    inputRef.current?.focus()
  }

  // Same three-tier scheme as the search sidebar: plain arrows step entry by
  // entry, Option/Alt+arrow jumps group by group, Cmd/Ctrl+arrow jumps to the
  // very top/bottom. Cmd/Ctrl+Left hands focus back to the search sidebar.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement !== inputRef.current) return
      const meta = e.metaKey || e.ctrlKey
      const alt = e.altKey

      if (e.key === 'ArrowLeft' && meta) {
        const input = document.querySelector<HTMLElement>('.sidebar-input')
        if (input) { e.preventDefault(); input.focus() }
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
        e.preventDefault()
        setSelectedIndex(i => {
          const entries = entriesRef.current
          const curGi = i >= 0 ? entries[i].groupIndex : -1
          const next = entries.findIndex(en => en.groupIndex === curGi + 1)
          return next === -1 ? i : next
        })
        return
      }
      if (e.key === 'ArrowUp' && alt) {
        e.preventDefault()
        setSelectedIndex(i => {
          const entries = entriesRef.current
          const curGi = i >= 0 ? entries[i].groupIndex : -1
          if (curGi <= 0) return i
          const prev = entries.findIndex(en => en.groupIndex === curGi - 1)
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
          const g = entry ? groupsRef.current[entry.groupIndex] : groupsRef.current[0]
          const snippet = entry ? g?.snippets[entry.snippetIndex] : g?.snippets[0]
          if (g) onOpenRef.current(g.path, g.name, false, snippet?.from)
          return i
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!open) {
    return (
      <button className="backlinks-strip" onClick={onToggleOpen}>
        <span className="backlinks-strip-arrow">‹</span>
      </button>
    )
  }

  // Precompute each group's starting flat index, in [linked..., unlinked...] order
  let acc = 0
  const starts = allGroups.map(g => { const s = acc; acc += g.snippets.length; return s })
  const totalGroups = shownLinked.length + shownUnlinked.length

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        <div className="backlinks-search-wrap">
          <input
            ref={inputRef}
            className="sidebar-input backlinks-input"
            placeholder="Filter mentions…"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            onFocus={e => {
              e.target.select()
              setSelectedIndex(i => (i === -1 && entriesRef.current.length ? 0 : i))
            }}
          />
          {filterQuery.trim() && (
            <span className="backlinks-search-count">{totalGroups}</span>
          )}
        </div>
        <button className="backlinks-fold" onClick={onToggleOpen}>›</button>
      </div>
      <div className="backlinks-body">
        {shownLinked.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-label">
              <span>Linked mentions</span>
              <span className="backlinks-section-count">{shownLinked.length}</span>
            </div>
            {shownLinked.map((g, i) => (
              <Group
                key={g.path}
                group={g}
                muted={false}
                startIndex={starts[i]}
                selectedIndex={selectedIndex}
                selectedRef={selectedRef}
                onOpen={onOpen}
                onHoverEntry={handleHoverEntry}
              />
            ))}
          </div>
        )}
        {shownUnlinked.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-label">
              <span>Unlinked mentions</span>
              <span className="backlinks-section-count">{shownUnlinked.length}</span>
            </div>
            {shownUnlinked.map((g, i) => (
              <Group
                key={g.path}
                group={g}
                muted
                startIndex={starts[shownLinked.length + i]}
                selectedIndex={selectedIndex}
                selectedRef={selectedRef}
                onOpen={onOpen}
                onHoverEntry={handleHoverEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
