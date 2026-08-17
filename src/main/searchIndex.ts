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
  content: string
}

// @ts-ignore – FlexSearch types are loose
const index = new FlexSearch.Document({
  tokenize: 'forward',
  document: {
    id: 'id',
    index: ['name', 'content'],
    store: ['path', 'name', 'content']
  }
})

const docs = new Map<string, DocRecord>()

export function indexFile(path: string, name: string, content: string): void {
  const id = path
  if (docs.has(id)) {
    // @ts-ignore
    index.remove(id)
  }
  const record: DocRecord = { id, path, name, content }
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

export async function search(query: string, limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const seen = new Set<string>()
  const results: SearchResult[] = []

  // FlexSearch tokenizes on non-alphanumeric chars, so purely symbolic queries
  // (e.g. "---", "___") produce no tokens and return nothing. Only invoke it
  // when the query contains at least one word character.
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

  // Fallback: direct substring scan covers symbolic queries and fills gaps when
  // FlexSearch finds nothing (e.g. query is a separator like "---" or "___").
  if (results.length < limit) {
    const q = query.toLowerCase()
    for (const doc of docs.values()) {
      if (results.length >= limit) break
      if (seen.has(doc.path)) continue
      if (doc.content.toLowerCase().includes(q) || doc.name.toLowerCase().includes(q)) {
        seen.add(doc.path)
        results.push({ path: doc.path, name: doc.name, snippet: buildSnippet(doc.content, query) })
      }
    }
  }

  return results
}
