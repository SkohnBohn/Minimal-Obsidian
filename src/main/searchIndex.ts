import FlexSearch from 'flexsearch'
import { stripMarkdownNoise } from './snippetText'

export interface SnippetSpan {
  html: string
  from: number  // absolute character offset into the file's raw content
  to: number
}

export interface SearchResult {
  path: string
  name: string
  snippets: SnippetSpan[]
}

interface DocRecord {
  id: string
  path: string
  name: string
  content: string       // main content only — what FlexSearch indexes
  sourcesContent: string
  sourcesOffset: number // absolute offset where sourcesContent begins in the raw file
}

// @ts-ignore – FlexSearch types are loose
const index = new FlexSearch.Document({
  tokenize: 'forward',
  document: {
    id: 'id',
    index: ['content'],
    store: ['path', 'name', 'content', 'sourcesContent', 'sourcesOffset']
  }
})

const docs = new Map<string, DocRecord>()

const SEPARATOR_RE = /^[-_*]{3,}\s*$/
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:/

function splitSources(raw: string): { main: string; sources: string; sourcesOffset: number } {
  const lines = raw.split('\n')
  // Walk backwards to find the last separator-like line
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!SEPARATOR_RE.test(lines[i])) continue
    // Check whether anything after it is a footnote definition
    const after = lines.slice(i + 1)
    if (after.some(l => FOOTNOTE_DEF_RE.test(l))) {
      const sourcesOffset = lines.slice(0, i + 1).join('\n').length + 1
      return { main: lines.slice(0, i).join('\n'), sources: after.join('\n'), sourcesOffset }
    }
  }
  return { main: raw, sources: '', sourcesOffset: raw.length }
}

export function indexFile(path: string, name: string, rawContent: string): void {
  const id = path
  if (docs.has(id)) {
    // @ts-ignore
    index.remove(id)
  }
  const { main, sources, sourcesOffset } = splitSources(rawContent)
  const record: DocRecord = { id, path, name, content: main, sourcesContent: sources, sourcesOffset }
  docs.set(id, record)
  // @ts-ignore
  index.add(record)
}

export function removeFile(path: string): void {
  if (docs.has(path)) {
    // @ts-ignore
    index.remove(path)
    docs.delete(path)
  }
}

// Exposes the already-maintained in-memory content cache for callers (e.g. backlinks)
// that need full-vault text without re-reading every file from disk on each query.
// main/sources are kept separate (rather than concatenated) along with sourcesOffset,
// so callers can compute absolute raw-file character offsets for either part.
export function listIndexedDocs(): Array<{ path: string; name: string; main: string; sources: string; sourcesOffset: number }> {
  return Array.from(docs.values()).map(d => ({
    path: d.path,
    name: d.name,
    main: d.content,
    sources: d.sourcesContent,
    sourcesOffset: d.sourcesOffset
  }))
}

function buildSnippets(content: string, query: string, offsetBase: number, maxHits = 50): SnippetSpan[] {
  const lower = content.toLowerCase()
  const q = query.toLowerCase()
  const results: SnippetSpan[] = []
  let searchFrom = 0

  while (results.length < maxHits) {
    const idx = lower.indexOf(q, searchFrom)
    if (idx === -1) break
    const lineStart = content.lastIndexOf('\n', idx - 1) + 1
    const lineEndRaw = content.indexOf('\n', idx)
    const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
    const start = Math.max(lineStart, idx - 30)
    const end = Math.min(lineEnd, idx + query.length + 90)
    const pre = start > lineStart ? '…' : ''
    const post = end < lineEnd ? '…' : ''
    const before = stripMarkdownNoise(content.slice(start, idx))
    const match = content.slice(idx, idx + query.length)
    const after = stripMarkdownNoise(content.slice(idx + query.length, end))
    results.push({
      html: `${pre}${before}<mark>${match}</mark>${after}${post}`,
      from: offsetBase + idx,
      to: offsetBase + idx + query.length
    })
    searchFrom = lineEnd + 1  // skip to next line — no two snippets from the same line
  }

  if (results.length === 0) {
    // Matched via title — show first non-empty line as plain preview
    let pos = 0
    for (const line of content.split('\n')) {
      if (line.trim()) {
        const first = line.slice(0, 120)
        results.push({
          html: stripMarkdownNoise(first),
          from: offsetBase + pos,
          to: offsetBase + pos + first.length
        })
        break
      }
      pos += line.length + 1
    }
  }

  return results
}

export async function search(query: string, includeSources: boolean, limit = 1000): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const seen = new Set<string>()
  const results: SearchResult[] = []

  if (/\w/.test(query)) {
    // @ts-ignore
    const rawResults = await index.searchAsync(query, { limit: 1000, enrich: true })
    for (const field of rawResults) {
      for (const r of (field as any).result) {
        const doc: DocRecord = r.doc
        if (seen.has(doc.path)) continue
        seen.add(doc.path)
        const inMain = doc.content.toLowerCase().includes(query.toLowerCase())
        const snippetSrc = inMain ? doc.content : (doc.sourcesContent || doc.content)
        const offsetBase = inMain ? 0 : doc.sourcesOffset
        results.push({ path: doc.path, name: doc.name, snippets: buildSnippets(snippetSrc, query, offsetBase) })
      }
    }
  }

  if (results.length < limit) {
    const q = query.toLowerCase()
    for (const doc of docs.values()) {
      if (results.length >= limit) break
      if (seen.has(doc.path)) continue
      const searchable = includeSources ? doc.content + '\n' + doc.sourcesContent : doc.content
      if (searchable.toLowerCase().includes(q)) {
        seen.add(doc.path)
        const useSources = includeSources && !doc.content.toLowerCase().includes(q)
        const snippetSrc = useSources ? doc.sourcesContent : doc.content
        const offsetBase = useSources ? doc.sourcesOffset : 0
        results.push({ path: doc.path, name: doc.name, snippets: buildSnippets(snippetSrc, query, offsetBase) })
      }
    }
  }

  return results
}
