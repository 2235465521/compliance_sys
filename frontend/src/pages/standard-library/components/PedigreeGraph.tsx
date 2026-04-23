import { Empty, Spin } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import type { TreeLink, TreeNode } from '@/types/standard-library'

type PedigreeGraphProps = {
  nodes: TreeNode[]
  links: TreeLink[]
  /** 当前输入的标准号；用于以该节点为「根层」做树状展开（无向 BFS 分层） */
  centerBzId?: string
  loading?: boolean
  /** 最小高度；实际高度按层数自动加大 */
  height?: number
  /** 点击图谱节点时回调（用于侧栏展示节点详情） */
  onNodeClick?: (nodeId: string) => void
}

const ROW_HEIGHT = 108
const PAD_X = 48
const PAD_Y = 36

/** 无向邻接表（谱系边视为双向，便于以查询标准为视觉中心分层） */
function buildAdjacency(nodeIds: Set<string>, links: TreeLink[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const id of nodeIds) adj.set(id, new Set())
  for (const l of links) {
    if (nodeIds.has(l.source) && nodeIds.has(l.target)) {
      adj.get(l.source)!.add(l.target)
      adj.get(l.target)!.add(l.source)
    }
  }
  return adj
}

/** 从 center 无向 BFS 得到每个节点到 center 的层深（center 为 0） */
function bfsDepthFromCenter(center: string, adj: Map<string, Set<string>>): Map<string, number> {
  const depth = new Map<string, number>()
  const q: string[] = []
  depth.set(center, 0)
  q.push(center)
  while (q.length) {
    const u = q.shift()!
    const du = depth.get(u)!
    for (const v of adj.get(u) || []) {
      if (!depth.has(v)) {
        depth.set(v, du + 1)
        q.push(v)
      }
    }
  }
  return depth
}

/** 有向边求入度，用于在缺少 center 时选结构根 */
function directedInDegree(nodeIds: Set<string>, links: TreeLink[]): Map<string, number> {
  const inDeg = new Map<string, number>()
  for (const id of nodeIds) inDeg.set(id, 0)
  for (const l of links) {
    if (nodeIds.has(l.source) && nodeIds.has(l.target)) {
      inDeg.set(l.target, (inDeg.get(l.target) ?? 0) + 1)
    }
  }
  return inDeg
}

/**
 * 将节点分层后赋予像素坐标：**自下而上**排布（层深 0 在最下，hop 越远越靠上），同层横向均匀分布。
 * 返回 width/height 供容器使用。
 */
function layoutLayeredPositions(
  nodeIds: string[],
  depth: Map<string, number>,
  containerWidth: number,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const byDepth = new Map<number, string[]>()
  let maxD = 0
  for (const id of nodeIds) {
    const d = depth.get(id) ?? 0
    maxD = Math.max(maxD, d)
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(id)
  }
  for (const arr of byDepth.values()) arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  const positions = new Map<string, { x: number; y: number }>()
  const innerW = Math.max(containerWidth - PAD_X * 2, 320)

  for (let d = 0; d <= maxD; d++) {
    const row = byDepth.get(d) ?? []
    const n = row.length
    const y = PAD_Y + (maxD - d) * ROW_HEIGHT
    for (let i = 0; i < n; i++) {
      const x =
        n === 1
          ? PAD_X + innerW / 2
          : PAD_X + (innerW * (i + 1)) / (n + 1)
      positions.set(row[i], { x, y })
    }
  }

  const width = Math.max(containerWidth, 400)
  const height = PAD_Y * 2 + (maxD + 1) * ROW_HEIGHT + 56
  return { positions, width, height }
}

/** 将 GET /api/get_tree_data/ 的 nodes + links 转为 ECharts graph（树状分层：当前标准在最下 + roam） */
export default function PedigreeGraph({ nodes, links, centerBzId, loading, height = 420, onNodeClick }: PedigreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [plotHeight, setPlotHeight] = useState(height)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (!chartRef.current) {
      chartRef.current = echarts.init(el, undefined, { renderer: 'canvas' })
    }
    const chart = chartRef.current

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    if (nodes.length === 0) {
      chart.clear()
      chart.off('click')
      setPlotHeight(height)
      return () => {
        window.removeEventListener('resize', onResize)
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id))
    const safeLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target))
    const adj = buildAdjacency(nodeIds, safeLinks)

    const center =
      centerBzId && nodeIds.has(centerBzId.trim())
        ? centerBzId.trim()
        : (() => {
            const inDeg = directedInDegree(nodeIds, safeLinks)
            const roots = [...nodeIds].filter((id) => (inDeg.get(id) ?? 0) === 0)
            if (roots.length) return roots.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))[0]
            return [...nodeIds].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))[0]
          })()

    const depth = bfsDepthFromCenter(center, adj)
    const maxReach = depth.size ? Math.max(...depth.values()) : 0
    for (const id of nodeIds) {
      if (!depth.has(id)) {
        depth.set(id, maxReach + 1)
      }
    }

    const cw = el.clientWidth || 800
    const { positions, height: layoutH } = layoutLayeredPositions([...nodeIds], depth, cw)
    const nextH = Math.max(height, layoutH)
    setPlotHeight(nextH)

    const stateOrder = [...new Set(nodes.map((n) => n.ex_state).filter(Boolean))]
    const categories = stateOrder.map((name) => ({ name: name || '未知' }))

    const data = nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: PAD_X + cw / 2, y: PAD_Y }
      const shortName = n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name
      const catIdx = Math.max(0, stateOrder.indexOf(n.ex_state))
      return {
        id: n.id,
        name: shortName,
        x: pos.x,
        y: pos.y,
        symbolSize: n.id === center ? 52 : 40,
        category: catIdx,
        value: n.ex_state,
        itemStyle: n.id === center ? { borderColor: '#1677ff', borderWidth: 2 } : undefined,
        label: {
          show: true,
          position: 'top',
          distance: 6,
          fontSize: 11,
          width: 140,
          overflow: 'truncate',
        },
        tooltip: {
          formatter: `${n.id}<br/>${n.name}<br/>状态：${n.ex_state}`,
        },
      }
    })

    const graphLinks = safeLinks.map((l) => ({
      source: l.source,
      target: l.target,
      label: {
        show: true,
        formatter: l.relation_type || '关系',
        fontSize: 10,
      },
      lineStyle: { width: 1.5, curveness: 0.08, color: '#91caff' },
    }))

    const onChartClick = (params: { dataType?: string; data?: unknown }) => {
      if (params.dataType !== 'node') return
      const data = params.data as { id?: string } | null | undefined
      const id = data?.id
      if (id) onNodeClickRef.current?.(id)
    }
    chart.off('click', onChartClick)
    chart.on('click', onChartClick)

    chart.setOption(
      {
        tooltip: { trigger: 'item' },
        legend: categories.length
          ? {
              data: categories.map((c) => c.name),
              bottom: 4,
            }
          : undefined,
        animationDurationUpdate: 400,
        series: [
          {
            type: 'graph',
            layout: 'none',
            roam: true,
            draggable: true,
            emphasis: {
              focus: 'adjacency',
              lineStyle: { width: 2.5, color: '#1677ff' },
            },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 10],
            categories,
            data,
            links: graphLinks,
            lineStyle: { opacity: 0.95 },
          },
        ],
      },
      true,
    )

    chart.resize()

    return () => {
      chart.off('click', onChartClick)
      window.removeEventListener('resize', onResize)
    }
  }, [nodes, links, centerBzId, height])

  useEffect(
    () => () => {
      chartRef.current?.dispose()
      chartRef.current = null
    },
    [],
  )

  if (!loading && nodes.length === 0) {
    return <Empty description="暂无族谱数据，请先输入标准号并点击「加载族谱」" />
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: plotHeight }}>
      {loading ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.75)',
          }}
        >
          <Spin tip="加载族谱数据…" />
        </div>
      ) : null}
      <div ref={containerRef} style={{ width: '100%', height: plotHeight }} />
    </div>
  )
}
