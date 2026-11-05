import React from 'react'

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

function Group({ group, muted, onOpen }: {
  group: BacklinkGroup
  muted: boolean
  onOpen: BacklinksPanelProps['onOpen']
}) {
  return (
    <div
      className={muted ? 'backlink-group backlink-group-muted' : 'backlink-group'}
      onClick={e => onOpen(group.path, group.name, e.metaKey || e.ctrlKey)}
    >
      <div className="backlink-group-title">{group.name}</div>
      {group.snippets.map((s, i) => (
        <div key={i} className="backlink-snippet" dangerouslySetInnerHTML={{ __html: s }} />
      ))}
    </div>
  )
}

export default function BacklinksPanel({ linked, unlinked, open, onToggleOpen, onOpen }: BacklinksPanelProps) {
  if (!open) {
    return (
      <button className="backlinks-strip" onClick={onToggleOpen}>
        <span className="backlinks-strip-arrow">‹</span>
      </button>
    )
  }

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        <span className="backlinks-header-label">Linked mentions</span>
        <span className="backlinks-header-count">{linked.length}</span>
        <button className="backlinks-fold" onClick={onToggleOpen}>›</button>
      </div>
      <div className="backlinks-body">
        {linked.length > 0 && (
          <div className="backlinks-section">
            {linked.map(g => <Group key={g.path} group={g} muted={false} onOpen={onOpen} />)}
          </div>
        )}
        {unlinked.length > 0 && (
          <div className="backlinks-section">
            <div className="backlinks-section-label">Unlinked mentions</div>
            {unlinked.map(g => <Group key={g.path} group={g} muted onOpen={onOpen} />)}
          </div>
        )}
      </div>
    </div>
  )
}
