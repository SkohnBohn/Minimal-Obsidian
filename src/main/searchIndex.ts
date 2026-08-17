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

  // @ts-ignore
  const rawResults = await index.searchAsync(query, { limit, enrich: true })

  const seen = new Set<string>()
  const results: SearchResult[] = []

  for (const field of rawResults) {
    for (const r of (field as any).result) {
      const doc: DocRecord = r.doc
      if (seen.has(doc.path)) continue
      seen.add(doc.path)
      results.push({
        path: doc.path,
        name: doc.name,
        snippet: buildSnippet(doc.content, query)
      })
    }
  }

  return results.slice(0, limit)
}
