import React, { useEffect, useRef, useState } from 'react'

interface BacklinkGroup {
  name: string
  path: string
  snippets: string[]
}

interface BacklinksPanelProps {
  linked: BacklinkGroup[]
  unlinked: BacklinkGroup[]
  open: boolean
  onToggleOpen: () => void
  onOpen: (path: string, name: string, newTab: boolean) => void
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
    <div
      className={muted ? 'backlink-group backlink-group-muted' : 'backlink-group'}
      onClick={e => onOpen(group.path, group.name, e.metaKey || e.ctrlKey)}
    >
      <div className="backlink-group-title">{group.name}</div>
      {group.snippets.map((s, i) => {
        const idx = startIndex + i
        return (
          <div
            key={i}
            ref={idx === selectedIndex ? selectedRef : undefined}
            className="backlink-snippet"
            data-selected={idx === selectedIndex ? 'true' : undefined}
            onMouseEnter={() => onHoverEntry(idx)}
            dangerouslySetInnerHTML={{ __html: s }}
          />
        )
      })}
    </div>
  )
}

export default function BacklinksPanel({ linked, unlinked, open, onToggleOpen, onOpen }: BacklinksPanelProps) {
  const allGroups = [...linked, ...unlinked]
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<FlatEntry[]>([])
  const groupsRef = useRef<BacklinkGroup[]>([])
  const onOpenRef = useRef(onOpen)

  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => {
    groupsRef.current = allGroups
    entriesRef.current = flattenEntries(allGroups)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, unlinked])

  // Focus the panel when it's explicitly toggled open (e.g. Cmd/Ctrl+Shift+B),
  // so arrow keys work immediately — but not on an incidental re-render where
  // `open` was already true (switching notes while the panel stays open).
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (open && !prevOpenRef.current) containerRef.current?.focus()
    prevOpenRef.current = open
  }, [open])

  // Reset selection when the note (and so its backlinks) changes
  useEffect(() => { setSelectedIndex(-1) }, [linked, unlinked])

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
    containerRef.current?.focus()
  }

  // Same three-tier scheme as the search sidebar: plain arrows step entry by
  // entry, Option/Alt+arrow jumps group by group, Cmd/Ctrl+arrow jumps to the
  // very top/bottom. Cmd/Ctrl+Left hands focus back to the search sidebar.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement !== containerRef.current) return
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
          if (g) onOpenRef.current(g.path, g.name, false)
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

  return (
    <div
      ref={containerRef}
      className="backlinks-panel"
      tabIndex={-1}
      onFocus={() => setSelectedIndex(i => (i === -1 && entriesRef.current.length ? 0 : i))}
    >
      <div className="backlinks-header">
        <span className="backlinks-header-label">Linked mentions</span>
        <span className="backlinks-header-count">{linked.length}</span>
        <button className="backlinks-fold" onClick={onToggleOpen}>›</button>
      </div>
      <div className="backlinks-body">
        {linked.length > 0 && (
          <div className="backlinks-section">
            {linked.map((g, i) => (
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
        {unlinked.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-label">Unlinked mentions</div>
            {unlinked.map((g, i) => (
              <Group
                key={g.path}
                group={g}
                muted
                startIndex={starts[linked.length + i]}
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
