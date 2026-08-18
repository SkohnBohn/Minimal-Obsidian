import FlexSearch from 'flexsearch'

export interface SearchResult {
  path: string
  name: string
  snippet: string
}

interface DocRecord {
  id: string
  path: string
  name: string
  content: string       // main content only — what FlexSearch indexes
  sourcesContent: string
}

// @ts-ignore – FlexSearch types are loose
const index = new FlexSearch.Document({
  tokenize: 'forward',
  document: {
    id: 'id',
    index: ['name', 'content'],
    store: ['path', 'name', 'content', 'sourcesContent']
  }
})

const docs = new Map<string, DocRecord>()

const SEPARATOR_RE = /^[-_*]{3,}\s*$/
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:/

function splitSources(raw: string): { main: string; sources: string } {
  const lines = raw.split('\n')
  // Walk backwards to find the last separator-like line
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!SEPARATOR_RE.test(lines[i])) continue
    // Check whether anything after it is a footnote definition
    const after = lines.slice(i + 1)
    if (after.some(l => FOOTNOTE_DEF_RE.test(l))) {
      return { main: lines.slice(0, i).join('\n'), sources: after.join('\n') }
    }
  }
  return { main: raw, sources: '' }
}

export function indexFile(path: string, name: string, rawContent: string): void {
  const id = path
  if (docs.has(id)) {
    // @ts-ignore
    index.remove(id)
  }
  const { main, sources } = splitSources(rawContent)
  const record: DocRecord = { id, path, name, content: main, sourcesContent: sources }
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

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 100)
  const start = Math.max(0, idx - 50)
  const end = Math.min(content.length, idx + query.length + 50)
  const pre = start > 0 ? '…' : ''
  const post = end < content.length ? '…' : ''
  const before = content.slice(start, idx)
  const match = content.slice(idx, idx + query.length)
  const after = content.slice(idx + query.length, end)
  return `${pre}${before}<mark>${match}</mark>${after}${post}`
}

export async function search(query: string, includeSources: boolean, limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const seen = new Set<string>()
  const results: SearchResult[] = []

  if (/\w/.test(query)) {
    // @ts-ignore
    const rawResults = await index.searchAsync(query, { limit, enrich: true })
    for (const field of rawResults) {
      for (const r of (field as any).result) {
        const doc: DocRecord = r.doc
        if (seen.has(doc.path)) continue
        seen.add(doc.path)
        results.push({ path: doc.path, name: doc.name, snippet: buildSnippet(doc.content, query) })
      }
    }
  }

  if (results.length < limit) {
    const q = query.toLowerCase()
    for (const doc of docs.values()) {
      if (results.length >= limit) break
      if (seen.has(doc.path)) continue
      const searchable = includeSources ? doc.content + '\n' + doc.sourcesContent : doc.content
      if (searchable.toLowerCase().includes(q) || doc.name.toLowerCase().includes(q)) {
        seen.add(doc.path)
        const snippetSrc = (includeSources && !doc.content.toLowerCase().includes(q))
          ? doc.sourcesContent : doc.content
        results.push({ path: doc.path, name: doc.name, snippet: buildSnippet(snippetSrc, query) })
      }
    }
  }

  return results
}
