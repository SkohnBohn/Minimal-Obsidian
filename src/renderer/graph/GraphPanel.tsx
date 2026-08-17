import React, { useEffect, useRef, useState, useCallback } from 'react'
import { zoom as d3zoom, ZoomTransform } from 'd3-zoom'
import { select } from 'd3-selection'

interface SimNode {
  id: string
  x: number
  y: number
  linkCount: number
}

interface SimEdge {
  source: string
  target: string
}

interface GraphPanelProps {
  activeNoteName: string | null
  onOpenNote: (name: string) => void
}

const NODE_RADIUS = (lc: number) => 4 + 3 * Math.sqrt(lc)

export default function GraphPanel({ activeNoteName, onOpenNote }: GraphPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const transformRef = useRef<ZoomTransform>(new (ZoomTransform as any)(1, 0, 0))
  const hoverNodeRef = useRef<SimNode | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const t = transformRef.current
    const nodes = nodesRef.current
    const edges = edgesRef.current
    const hover = hoverNodeRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const neighbourSet: Set<string> | null = hover
      ? new Set([
          hover.id,
          ...edges
            .filter(e => e.source === hover.id || e.target === hover.id)
            .flatMap(e => [e.source, e.target])
        ])
      : null

    for (const edge of edges) {
      const s = nodeMap.get(edge.source)
      const tgt = nodeMap.get(edge.target)
      if (!s || !tgt) continue
      const dimmed = neighbourSet && !neighbourSet.has(edge.source) && !neighbourSet.has(edge.target)
      ctx.globalAlpha = dimmed ? 0.1 : 0.5
      ctx.strokeStyle = '#e6e5e5'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.stroke()
    }

    for (const node of nodes) {
      const r = NODE_RADIUS(node.linkCount)
      const dimmed = neighbourSet && !neighbourSet.has(node.id)
      ctx.globalAlpha = dimmed ? 0.2 : 1.0
      ctx.fillStyle = '#8b7040'
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
      ctx.fill()

      if (node.id === activeNoteName) {
        ctx.globalAlpha = dimmed ? 0.2 : 1.0
        ctx.strokeStyle = '#262626'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [activeNoteName])

  // Resize canvas to container
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
  }, [draw])

  useEffect(() => { draw() }, [activeNoteName, draw])

  // Load graph and run worker
  useEffect(() => {
    let cancelled = false
    async function loadGraph() {
      const { nodes: rawNodes, edges: rawEdges } = await window.api.vault.links()
      if (cancelled) return

      const linkCounts = new Map<string, number>()
      for (const { source, target } of rawEdges) {
        linkCounts.set(source, (linkCounts.get(source) ?? 0) + 1)
        linkCounts.set(target, (linkCounts.get(target) ?? 0) + 1)
      }

      const canvas = canvasRef.current
      const w = canvas?.width ?? 800
      const h = canvas?.height ?? 600

      const worker = new Worker(
        new URL('./graphWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.postMessage({
        nodes: rawNodes.map(id => ({ id, linkCount: linkCounts.get(id) ?? 0 })),
        edges: rawEdges,
        width: w,
        height: h
      })

      worker.onmessage = (e) => {
        if (cancelled) return
        nodesRef.current = e.data.nodes
        edgesRef.current = e.data.edges
        draw()
        worker.terminate()
      }
    }
    loadGraph()
    return () => { cancelled = true }
  }, [draw])

  // d3-zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', e => {
        transformRef.current = e.transform
        draw()
      })
    select(canvas).call(zoomBehavior)
    return () => { select(canvas).on('.zoom', null) }
  }, [draw])

  const getNodeAt = useCallback((ex: number, ey: number): SimNode | null => {
    const t = transformRef.current
    const x = (ex - t.x) / t.k
    const y = (ey - t.y) / t.k
    for (const node of nodesRef.current) {
      const r = NODE_RADIUS(node.linkCount)
      if ((x - node.x) ** 2 + (y - node.y) ** 2 <= r * r) return node
    }
    return null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    hoverNodeRef.current = node
    setTooltip(node ? { x: e.clientX - rect.left + 8, y: e.clientY - rect.top - 20, name: node.id } : null)
    draw()
  }, [draw, getNodeAt])

  const handleMouseLeave = useCallback(() => {
    hoverNodeRef.current = null
    setTooltip(null)
    draw()
  }, [draw])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (node) onOpenNote(node.id)
  }, [getNodeAt, onOpenNote])

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
