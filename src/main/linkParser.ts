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
