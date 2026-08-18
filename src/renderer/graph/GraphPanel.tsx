import React, { useEffect, useRef, useState } from 'react'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  SimulationNodeDatum
} from 'd3-force'
import { zoom as d3zoom, zoomIdentity, ZoomTransform, ZoomBehavior } from 'd3-zoom'
import { select } from 'd3-selection'

interface GraphNode extends SimulationNodeDatum {
  id: string
  linkCount: number
}

interface GraphEdge {
  source: string
  target: string
}

interface RenderedNode {
  id: string
  x: number
  y: number
  linkCount: number
}

interface GraphPanelProps {
  activeNoteName: string | null
  onOpenNote: (name: string) => void
  highlightNames?: Set<string>
}

// Persists across tab switches for the lifetime of the app session
let cachedNodes: RenderedNode[] | null = null
let cachedEdges: GraphEdge[] | null = null
let cachedTransform: { x: number; y: number; k: number } | null = null

const NODE_RADIUS = (lc: number) => 4 + 3 * Math.sqrt(lc)

function computeFitTransform(nodes: RenderedNode[], w: number, h: number): ZoomTransform {
  if (!nodes.length) return zoomIdentity
  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 60
  const k = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1), 1)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k)
}

export default function GraphPanel({ activeNoteName, onOpenNote, highlightNames }: GraphPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<RenderedNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const hoverNodeRef = useRef<RenderedNode | null>(null)
  const activeNoteRef = useRef(activeNoteName)
  const highlightNamesRef = useRef(highlightNames)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null)

  useEffect(() => {
    activeNoteRef.current = activeNoteName
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteName])

  useEffect(() => {
    highlightNamesRef.current = highlightNames
    draw(highlightNames)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightNames])

  function draw(hlOverride?: Set<string>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const t = transformRef.current
    const nodes = nodesRef.current
    const edges = edgesRef.current
    const hover = hoverNodeRef.current
    const active = activeNoteRef.current
    const hlNames = hlOverride !== undefined ? hlOverride : highlightNamesRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const neighbourSet: Set<string> | null = hover
      ? new Set([hover.id, ...edges
          .filter(e => e.source === hover.id || e.target === hover.id)
          .flatMap(e => [e.source, e.target])])
      : null

    const hasHl = hlNames && hlNames.size > 0

    for (const edge of edges) {
      const s = nodeMap.get(edge.source)
      const tgt = nodeMap.get(edge.target)
      if (!s || !tgt) continue
      const dimmedByHover = neighbourSet && !neighbourSet.has(edge.source) && !neighbourSet.has(edge.target)
      const dimmedBySearch = hasHl && (!hlNames!.has(edge.source) || !hlNames!.has(edge.target))
      ctx.globalAlpha = (dimmedByHover || dimmedBySearch) ? 0.06 : 0.45
      ctx.strokeStyle = '#8b7040'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.stroke()
    }

    for (const node of nodes) {
      const r = NODE_RADIUS(node.linkCount)
      const dimmedByHover = neighbourSet && !neighbourSet.has(node.id)
      const isHl = hasHl && hlNames!.has(node.id)
      const dimmedBySearch = hasHl && !isHl
      ctx.globalAlpha = dimmedByHover ? 0.2 : dimmedBySearch ? 0.12 : 1.0
      ctx.fillStyle = isHl ? '#c09040' : '#8b7040'
      ctx.beginPath()
      ctx.arc(node.x, node.y, isHl ? r + 1.5 : r, 0, Math.PI * 2)
      ctx.fill()
      if (node.id === active) {
        ctx.strokeStyle = '#262626'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  // Applies transform to both the ref and d3-zoom's internal state so they stay in sync
  function applyTransform(t: ZoomTransform) {
    transformRef.current = t
    const canvas = canvasRef.current
    if (canvas && zoomRef.current) {
      select(canvas).call(zoomRef.current.transform, t)
    } else {
      draw()
    }
  }

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const resize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // d3-zoom — must be set up BEFORE load graph so zoomRef is ready
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const zb = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', e => { transformRef.current = e.transform; draw() })
    select(canvas).call(zb)
    zoomRef.current = zb
    return () => { select(canvas).on('.zoom', null); zoomRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load graph — restore from cache or simulate fresh
  useEffect(() => {
    let cancelled = false

    if (cachedNodes && cachedEdges) {
      nodesRef.current = cachedNodes
      edgesRef.current = cachedEdges
      const t = cachedTransform
        ? zoomIdentity.translate(cachedTransform.x, cachedTransform.y).scale(cachedTransform.k)
        : zoomIdentity
      // Sync transform into d3-zoom so interactions continue from this state
      applyTransform(t)
      draw()
    } else {
      ;(async () => {
        const { nodes: rawNodeIds, edges: rawEdges } = await window.api.vault.links()
        if (cancelled) return

        const canvas = canvasRef.current
        const w = canvas?.width ?? 800
        const h = canvas?.height ?? 600

        const linkCounts = new Map<string, number>()
        for (const { source, target } of rawEdges) {
          linkCounts.set(source, (linkCounts.get(source) ?? 0) + 1)
          linkCounts.set(target, (linkCounts.get(target) ?? 0) + 1)
        }

        const simNodes: GraphNode[] = rawNodeIds.map((id, i) => ({
          id,
          linkCount: linkCounts.get(id) ?? 0,
          x: w / 2 + Math.cos((i / rawNodeIds.length) * Math.PI * 2) * 150,
          y: h / 2 + Math.sin((i / rawNodeIds.length) * Math.PI * 2) * 150
        }))

        const idxMap = new Map(simNodes.map((n, i) => [n.id, i]))
        const simLinks = rawEdges
          .map(e => ({ source: idxMap.get(e.source) ?? 0, target: idxMap.get(e.target) ?? 0 }))
          .filter(l => l.source !== l.target)

        const sim = forceSimulation(simNodes)
          .force('charge', forceManyBody().strength(-60))
          .force('link', forceLink(simLinks).distance(60).iterations(2))
          .force('center', forceCenter(w / 2, h / 2))
          .force('collide', forceCollide<GraphNode>(d => NODE_RADIUS(d.linkCount) + 2))
          .stop()

        for (let i = 0; i < 300; i++) {
          sim.tick()
          if (sim.alpha() < 0.001) break
        }

        if (cancelled) return

        nodesRef.current = simNodes.map(n => ({
          id: n.id, linkCount: n.linkCount,
          x: n.x ?? w / 2, y: n.y ?? h / 2
        }))
        edgesRef.current = rawEdges

        // Auto-fit to show all nodes
        const fitT = computeFitTransform(nodesRef.current, w, h)
        applyTransform(fitT)
        draw()
      })()
    }

    return () => {
      cancelled = true
      if (nodesRef.current.length) {
        cachedNodes = nodesRef.current
        cachedEdges = edgesRef.current
        const t = transformRef.current
        cachedTransform = { x: t.x, y: t.y, k: t.k }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getNodeAt(ex: number, ey: number): RenderedNode | null {
    const t = transformRef.current
    const x = (ex - t.x) / t.k
    const y = (ey - t.y) / t.k
    for (const node of nodesRef.current) {
      const r = NODE_RADIUS(node.linkCount)
      if ((x - node.x) ** 2 + (y - node.y) ** 2 <= r * r) return node
    }
    return null
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    hoverNodeRef.current = node
    setTooltip(node ? { x: e.clientX - rect.left + 8, y: e.clientY - rect.top - 20, name: node.id } : null)
    draw()
  }

  function handleMouseLeave() {
    hoverNodeRef.current = null
    setTooltip(null)
    draw()
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (node) onOpenNote(node.id)
  }

  return (
    <div ref={containerRef} className="graph-panel">
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {tooltip && (
        <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
