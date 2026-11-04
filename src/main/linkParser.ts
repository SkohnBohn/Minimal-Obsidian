const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

export interface LinkGraph {
  nodes: string[]
  edges: Array<{ source: string; target: string }>
}

export function extractLinks(content: string): string[] {
  const links: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(WIKILINK_RE.source, 'g')
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim())
  }
  return links
}

export function buildLinkGraph(files: Array<{ name: string; content: string }>): LinkGraph {
  const nodeSet = new Set<string>(files.map(f => f.name))
  const edges: Array<{ source: string; target: string }> = []

  for (const file of files) {
    const links = extractLinks(file.content)
    for (const target of links) {
      edges.push({ source: file.name, target })
      nodeSet.add(target)
    }
  }

  return { nodes: Array.from(nodeSet), edges }
}

// ── Backlinks ────────────────────────────────────────────────────────────
//
// "linked" = other notes that reference this one via [[wikilink]].
// "unlinked" = plain-text occurrences of this note's title elsewhere, not
// yet turned into a link. Kept separate (and rendered lighter) so the two
// very different kinds of evidence — deliberate vs. incidental — never blur
// together.

export interface BacklinkGroup {
  name: string
  path: string
  snippets: string[]
}

export interface Backlinks {
  linked: BacklinkGroup[]
  unlinked: BacklinkGroup[]
}

// Same shape as WIKILINK_RE but also captures the display text (after `|`),
// needed here to show what the linking note actually reads as.
const WIKILINK_DISPLAY_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

const MAX_SNIPPETS_PER_GROUP = 20
const SNIPPET_CONTEXT = 50

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

function makeSnippet(line: string, matchStart: number, matchLen: number, display: string): string {
  const start = Math.max(0, matchStart - SNIPPET_CONTEXT)
  const end = Math.min(line.length, matchStart + matchLen + SNIPPET_CONTEXT)
  const pre = start > 0 ? '…' : ''
  const post = end < line.length ? '…' : ''
  const before = escapeHtml(line.slice(start, matchStart))
  const after = escapeHtml(line.slice(matchStart + matchLen, end))
  return `${pre}${before}<mark>${escapeHtml(display)}</mark>${after}${post}`
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch)
}

export function findBacklinks(
  targetName: string,
  docs: Array<{ path: string; name: string; content: string }>
): Backlinks {
  const linked: BacklinkGroup[] = []
  const unlinked: BacklinkGroup[] = []
  if (!targetName) return { linked, unlinked }
  const targetLower = targetName.toLowerCase()

  for (const doc of docs) {
    if (doc.name === targetName) continue  // a note's own self-links aren't "backlinks"
    const linkedSnippets: string[] = []
    const unlinkedSnippets: string[] = []

    for (const line of doc.content.split('\n')) {
      const linkSpans: Array<[number, number]> = []
      const re = new RegExp(WIKILINK_DISPLAY_RE.source, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        linkSpans.push([m.index, m.index + m[0].length])
        if (linkedSnippets.length >= MAX_SNIPPETS_PER_GROUP) continue
        if (m[1].trim() !== targetName) continue
        const display = (m[2] ?? m[1]).trim()
        linkedSnippets.push(makeSnippet(line, m.index, m[0].length, display))
      }

      // Plain-text mentions: same text, outside any [[...]] span, not glued
      // to surrounding letters/digits (so "Cat" doesn't match "Category").
      const lowerLine = line.toLowerCase()
      let searchFrom = 0
      while (unlinkedSnippets.length < MAX_SNIPPETS_PER_GROUP) {
        const idx = lowerLine.indexOf(targetLower, searchFrom)
        if (idx === -1) break
        searchFrom = idx + targetName.length
        const before = idx > 0 ? line[idx - 1] : undefined
        const after = idx + targetName.length < line.length ? line[idx + targetName.length] : undefined
        if (isWordChar(before) || isWordChar(after)) continue
        if (linkSpans.some(([s, e]) => idx >= s && idx < e)) continue
        unlinkedSnippets.push(makeSnippet(line, idx, targetName.length, line.slice(idx, idx + targetName.length)))
      }
    }

    if (linkedSnippets.length) linked.push({ name: doc.name, path: doc.path, snippets: linkedSnippets })
    if (unlinkedSnippets.length) unlinked.push({ name: doc.name, path: doc.path, snippets: unlinkedSnippets })
  }

  linked.sort((a, b) => a.name.localeCompare(b.name))
  unlinked.sort((a, b) => a.name.localeCompare(b.name))
  return { linked, unlinked }
}
