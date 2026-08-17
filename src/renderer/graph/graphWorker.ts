import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide
} from 'd3-force'

interface GraphNode {
  id: string
  linkCount: number
  x?: number
  y?: number
}

interface GraphEdge {
  source: string
  target: string
}

interface WorkerInput {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

interface WorkerOutput {
  nodes: Array<{ id: string; x: number; y: number; linkCount: number }>
  edges: Array<{ source: string; target: string }>
}

const NODE_RADIUS = (linkCount: number) => 4 + 3 * Math.sqrt(linkCount)

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { nodes, edges, width, height } = e.data

  const simNodes = nodes.map(n => ({ ...n }))
  const idToIdx = new Map(simNodes.map((n, i) => [n.id, i]))

  const simLinks = edges
    .map(edge => ({
      source: idToIdx.get(edge.source) ?? 0,
      target: idToIdx.get(edge.target) ?? 0
    }))
    .filter(l => l.source !== l.target)

  const sim = forceSimulation(simNodes as any)
    .force('charge', forceManyBody().strength(-60))
    .force(
      'link',
      forceLink(simLinks).distance(60).iterations(2)
    )
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'collide',
      forceCollide((d: any) => NODE_RADIUS(d.linkCount) + 2)
    )
    .stop()

  // Run until alpha < 0.001
  for (let i = 0; i < 300; i++) {
    sim.tick()
    if (sim.alpha() < 0.001) break
  }

  const result: WorkerOutput = {
    nodes: simNodes.map((n: any) => ({
      id: n.id,
      x: n.x ?? width / 2,
      y: n.y ?? height / 2,
      linkCount: n.linkCount
    })),
    edges: edges
  }

  self.postMessage(result)
}
