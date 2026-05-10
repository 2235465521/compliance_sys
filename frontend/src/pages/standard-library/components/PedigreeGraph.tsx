import { Empty, Spin } from 'antd'
import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import type { TreeLink, TreeNode } from '@/types/standard-library'

type PedigreeGraphProps = {
  nodes: TreeNode[]
  links: TreeLink[]
  /** 检索中心节点 id/std_code：仅当缺少 `layout.rank` 时用无向 BFS 深度兜底纵向分层 */
  centerBzId?: string
  loading?: boolean
  /** 最小高度；实际高度按层数自动加大 */
  height?: number
  /** 点击图谱节点时回调（用于侧栏展示节点详情） */
  onNodeClick?: (nodeId: string) => void
}

const ROW_HEIGHT = 108
/** 纵向：rank 越大越靠下（rank 最小在上）；需在垂直方向翻转时改表达式即可 */
const Y_STEP = ROW_HEIGHT
const COL_STEP = 132
const PAD_X = 48
const PAD_Y = 36
/** fitView：画布边距（与节点 symbol + 底部 label 留空） */
const FIT_MARGIN = 40
/** 缩放时将「标准号标签」占位计入 bbox，避免初次 fit 裁切 */
const FIT_LABEL_SLOP_X = 104
const FIT_LABEL_SLOP_Y = 64
/** 世界坐标→画布：允许放大以吃满视口 */
const FIT_MAX_SCALE = 14
/** 内容包络相对内边距区的目标占比 */
const FIT_VIEWPORT_RATIO = 0.98
/**
 * 同行节点圆心最小水平距（与底部 label `width`、截断展示配合，减轻标准号叠在一起）。
 * 真实行宽不够时由 `spreadHorizontalByRow` 按行内节点数自动收窄 gap。
 */
const GRAPH_MIN_NODE_CENTER_GAP = 120
/**
 * 节点标准号 label（position: bottom）与圆点的间距；略大以免与上/下层圆点贴连、叠字。
 * 需与 `inflateBounds` 内「文字向下延伸」估算一致。
 */
const GRAPH_NODE_LABEL_DISTANCE = 18
/** 自圆心向下：圆点半径 + label 区高度的大致像素（与 fontSize 9–10、单行截断一致） */
const GRAPH_LABEL_EXTEND_BELOW_CENTER = GRAPH_NODE_LABEL_DISTANCE + 28
/** 与下方对称，用于标签交错在「上」侧时的包络与 fit */
const GRAPH_LABEL_EXTEND_ABOVE_CENTER = GRAPH_NODE_LABEL_DISTANCE + 28

/** 由当前 y 间距估计「同一层」聚类阈值（像素） */
function estimateYBandForRowClustering(laidOut: Map<string, { x: number; y: number }>): number {
  const ys = [...laidOut.values()]
    .map((p) => p.y)
    .sort((a, b) => a - b)
  const diffs: number[] = []
  for (let i = 1; i < ys.length; i++) {
    const d = ys[i] - ys[i - 1]
    if (d > 2) diffs.push(d)
  }
  if (!diffs.length) return 48
  diffs.sort((a, b) => a - b)
  const mid = diffs[Math.floor(diffs.length / 2)]!
  return Math.min(76, Math.max(36, mid * 0.4))
}

/**
 * 同一水平层内按 x 排序拉开圆心距，再层内水平「保中心」平移，减轻标准号并排覆盖。
 * `maxInnerWidth` 为可用内容区宽度；行内节点多时自动缩小 gap，仍尽量逼近 `preferredMinGap`。
 */
function spreadHorizontalByRow(
  laidOut: Map<string, { x: number; y: number }>,
  yMergePx: number,
  preferredMinGap: number,
  maxInnerWidth: number,
) {
  type P = { id: string; x: number; y: number }
  const list: P[] = [...laidOut.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }))
  list.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id, 'zh-Hans-CN'))

  const rows: P[][] = []
  for (const p of list) {
    if (!rows.length) {
      rows.push([{ ...p }])
      continue
    }
    const cur = rows[rows.length - 1]!
    const y0 = cur[0].y
    if (Math.abs(p.y - y0) <= yMergePx) cur.push({ ...p })
    else rows.push([{ ...p }])
  }

  for (const row of rows) {
    if (row.length <= 1) {
      const o = row[0]!
      laidOut.set(o.id, { x: o.x, y: o.y })
      continue
    }
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, 'zh-Hans-CN'))

    const k = row.length
    const capGap = (maxInnerWidth * 0.94) / Math.max(k - 1, 1)
    const gap = Math.min(preferredMinGap, capGap)

    const origCx = row.reduce((s, p) => s + p.x, 0) / k

    for (let i = 1; i < row.length; i++) {
      const need = row[i - 1].x + gap
      if (row[i].x < need) row[i].x = need
    }

    const newCx = row.reduce((s, p) => s + p.x, 0) / k
    const shift = origCx - newCx
    for (const p of row) {
      p.x += shift
      laidOut.set(p.id, { x: p.x, y: p.y })
    }
  }
}

/**
 * 同一水平层内按 x 排序，奇偶交错将标准号标在圆点「上 / 下」，减轻并排时文字叠在一起。
 */
function computeStaggeredLabelSides(laidOut: Map<string, { x: number; y: number }>): Map<string, 'top' | 'bottom'> {
  const yBand = estimateYBandForRowClustering(laidOut)
  type P = { id: string; x: number; y: number }
  const list: P[] = [...laidOut.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }))
  list.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id, 'zh-Hans-CN'))

  const rows: P[][] = []
  for (const p of list) {
    if (!rows.length) {
      rows.push([{ ...p }])
      continue
    }
    const cur = rows[rows.length - 1]!
    const y0 = cur[0].y
    if (Math.abs(p.y - y0) <= yBand) cur.push({ ...p })
    else rows.push([{ ...p }])
  }

  const out = new Map<string, 'top' | 'bottom'>()
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, 'zh-Hans-CN'))
    row.forEach((p, idx) => {
      out.set(p.id, idx % 2 === 0 ? 'bottom' : 'top')
    })
  }
  return out
}

/** 整包络相对 (cx,cy) 做统一缩放（用于 spread 后重新吃满内框） */
function scaleLaidOutUniform(
  laidOut: Map<string, { x: number; y: number }>,
  cx: number,
  cy: number,
  factor: number,
) {
  for (const [id, p] of laidOut) {
    laidOut.set(id, {
      x: cx + (p.x - cx) * factor,
      y: cy + (p.y - cy) * factor,
    })
  }
}

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

function coerceFiniteFloat(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** `layout_pos` 与顶层 `x`/`y` 二选一即为后端预设坐标（非 rank/col） */
function pickPresetXY(n: TreeNode): { x: number; y: number } | null {
  const lx = coerceFiniteFloat(n.layout_pos?.x)
  const ly = coerceFiniteFloat(n.layout_pos?.y)
  if (lx !== null && ly !== null) return { x: lx, y: ly }
  const ax = coerceFiniteFloat(n.x)
  const ay = coerceFiniteFloat(n.y)
  if (ax !== null && ay !== null) return { x: ax, y: ay }
  return null
}

function coerceFiniteInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

/**
 * 用 rank/col 初值算像素坐标：**非力导向**。缺 layout 时用 BFS depth 代 rank，
 * col 在行内顺延分配；与后端约定 x = col*COL_STEP+X0，y = rank*Y_STEP+Y0（再做整体水平居中画布）。
 */
function layoutFromRankCol(
  nodes: TreeNode[],
  fallbackDepthById: Map<string, number>,
  containerWidth: number,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  /** 单层内：先用 layout.col，缺失者按节点序填列并在与显式 col 冲突时顺延 */
  function assignColsInRank(rankBucketIds: string[]): Map<string, number> {
    const out = new Map<string, number>()
    const occupied = new Set<number>()
    const withExplicit = rankBucketIds
      .filter((id) => coerceFiniteInt(byId.get(id)?.layout?.col) !== null)
      .map((id) => ({ id, col: coerceFiniteInt(byId.get(id)!.layout?.col)! }))
      .sort((a, b) => a.col - b.col || a.id.localeCompare(b.id, 'zh-Hans-CN'))
    const implicit = rankBucketIds
      .filter((id) => coerceFiniteInt(byId.get(id)?.layout?.col) === null)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

    for (const { id, col } of withExplicit) {
      let c = col
      while (occupied.has(c)) c++
      occupied.add(c)
      out.set(id, c)
    }
    let next = [...occupied.keys()].reduce((m, x) => Math.max(m, x), -1)
    for (const id of implicit) {
      next++
      while (occupied.has(next)) next++
      occupied.add(next)
      out.set(id, next)
    }
    return out
  }

  /** 兜底 rank：以 center 起算的 BFS 深度；后端未给 layout.rank 时使用 */
  const effectiveRankFor = (id: string): number => {
    const n = byId.get(id)
    const r = coerceFiniteInt(n?.layout?.rank)
    if (r !== null) return r
    return coerceFiniteInt(fallbackDepthById.get(id)) ?? 0
  }

  const rankToIds = new Map<number, Set<string>>()
  for (const n of nodes) {
    const r = effectiveRankFor(n.id)
    if (!rankToIds.has(r)) rankToIds.set(r, new Set())
    rankToIds.get(r)!.add(n.id)
  }

  const ranksAscending = [...rankToIds.keys()].sort((a, b) => a - b)

  /** 单层内：缺 layout.rank 时用 BFS 深度聚行；layout.col 缺省时分列顺延避让冲突 */
  const colByNode = new Map<string, number>()
  for (const rankKey of ranksAscending) {
    const rowIds = [...(rankToIds.get(rankKey) ?? [])].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    const per = assignColsInRank(rowIds)
    for (const id of rowIds) colByNode.set(id, per.get(id) ?? 0)
  }

  const ranks = ranksAscending
  const cols = [...colByNode.values()]
  const rankMin = Math.min(...ranks)
  const rankMax = Math.max(...ranks)
  const colMin = cols.length ? Math.min(...cols) : 0
  const colMax = cols.length ? Math.max(...cols) : 0

  const nr = rankMax - rankMin + 1
  const nc = colMax - colMin + 1
  const colSpanPx = nc * COL_STEP
  const innerWNeeded = PAD_X + colSpanPx + 120
  const width = Math.max(containerWidth || 800, innerWNeeded, 400)
  const leftInset = PAD_X + Math.max(0, (width - PAD_X * 2 - colSpanPx) / 2)
  /** x = col·COL_STEP + X0（再整体水平居中画布） */
  const x0 = leftInset - colMin * COL_STEP

  const positions = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const r = effectiveRankFor(n.id) - rankMin
    const col = colByNode.get(n.id) ?? colMin
    const x = x0 + col * COL_STEP
    const y = PAD_Y + r * Y_STEP
    positions.set(n.id, { x, y })
  }

  const height = PAD_Y + nr * Y_STEP + PAD_Y + 56
  return { positions, width, height }
}

/**
 * **`layout_pos` / `x`·`y` 优先**；否则 `layout.rank/col` × 步长 + BFS 兜底。
 * **fitView**：对全体节点世界坐标做**统一缩放**（可 **>1** 填满可视区），几何中心对齐视口水平中线；最后在可视内边距内**垂直居中**内容包络（不足则加高画布）。
 */
function composeGraphLayouts(
  nodes: TreeNode[],
  fallbackDepthById: Map<string, number>,
  containerWidth: number,
  minPlotHeightProp: number,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const fb = layoutFromRankCol(nodes, fallbackDepthById, containerWidth)
  const merged = new Map<string, { x: number; y: number }>()
  const hiById = new Map(nodes.map((n) => [n.id, Boolean(n.highlighted)]))

  let orphanFallback = 0
  for (const n of nodes) {
    const pre = pickPresetXY(n)
    if (pre) {
      merged.set(n.id, pre)
      continue
    }
    const f = fb.positions.get(n.id)
    if (f) merged.set(n.id, f)
    else {
      const k = orphanFallback++
      merged.set(n.id, {
        x: PAD_X + (k % 5) * COL_STEP,
        y: PAD_Y + Math.floor(k / 5) * Y_STEP,
      })
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of merged.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0
  if (!Number.isFinite(maxX)) maxX = minX + COL_STEP
  if (!Number.isFinite(maxY)) maxY = minY + Y_STEP

  const cw = Math.max(containerWidth || 800, 400)
  const worldCx = (minX + maxX) / 2
  const worldCy = (minY + maxY) / 2
  const spanW = Math.max(maxX - minX, COL_STEP * 0.5)
  const spanH = Math.max(maxY - minY, Y_STEP * 0.5)

  /** 节点中心周围的粗略 UI 包络（圆点 + 标准号可能在圆上/下侧）；用于 fit 后不裁切 */
  function inflateBounds(centerX: number, centerY: number, hi: boolean) {
    const half = hi ? 16 : 12
    return {
      minX: centerX - half - FIT_LABEL_SLOP_X / 2,
      maxX: centerX + half + FIT_LABEL_SLOP_X / 2,
      minY: centerY - half - GRAPH_LABEL_EXTEND_ABOVE_CENTER,
      maxY: centerY + half + GRAPH_LABEL_EXTEND_BELOW_CENTER,
    }
  }

  function layoutWithScale(plotH: number, scaleFactor: number) {
    const tcx = cw / 2
    const tcy = plotH / 2
    const next = new Map<string, { x: number; y: number }>()
    for (const [id, p] of merged) {
      next.set(id, {
        x: (p.x - worldCx) * scaleFactor + tcx,
        y: (p.y - worldCy) * scaleFactor + tcy,
      })
    }
    return next
  }

  function boundsOfLaidOut(laidOut: Map<string, { x: number; y: number }>) {
    let bMinX = Infinity
    let bMinY = Infinity
    let bMaxX = -Infinity
    let bMaxY = -Infinity
    for (const [id, q] of laidOut) {
      const hi = hiById.get(id) ?? false
      const bb = inflateBounds(q.x, q.y, hi)
      bMinX = Math.min(bMinX, bb.minX)
      bMinY = Math.min(bMinY, bb.minY)
      bMaxX = Math.max(bMaxX, bb.maxX)
      bMaxY = Math.max(bMaxY, bb.maxY)
    }
    if (!Number.isFinite(bMinX)) {
      bMinX = 0
      bMinY = 0
      bMaxX = cw
      bMaxY = minPlotHeightProp
    }
    return { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY }
  }

  let plotH = Math.max(minPlotHeightProp, fb.height, spanH + 2 * FIT_MARGIN + FIT_LABEL_SLOP_Y + 48)
  let laidOut: Map<string, { x: number; y: number }> = new Map()
  const availWBase = cw - 2 * FIT_MARGIN
  /** 当高度限制了 s、导致水平仍溢出时，额外乘在统一缩放外（收窄） */
  let narrow = 1

  for (let iter = 0; iter < 22; iter++) {
    const availH = Math.max(plotH - 2 * FIT_MARGIN, 60)
    const sGeom = Math.min(
      availWBase / Math.max(spanW + FIT_LABEL_SLOP_X, 1e-6),
      availH / Math.max(spanH + FIT_LABEL_SLOP_Y, 1e-6),
    )
    let sRaw = Math.min(Number.isFinite(sGeom) ? sGeom : 0.08, FIT_MAX_SCALE)
    let s = sRaw * narrow
    if (!Number.isFinite(s) || s <= 0) s = 0.06
    /** 留白：过大或过小的图都略收一点 */
    s = Math.min(s * FIT_VIEWPORT_RATIO, FIT_MAX_SCALE)
    laidOut = layoutWithScale(plotH, s)

    const bb = boundsOfLaidOut(laidOut)
    const overflowY = bb.maxY + PAD_Y > plotH || bb.minY < PAD_Y * 0.25
    const overflowX = bb.minX < FIT_MARGIN - 0.5 || bb.maxX > cw - FIT_MARGIN + 0.5

    if (!overflowY && !overflowX) break

    if (overflowY) plotH = Math.max(plotH, Math.ceil(bb.maxY + PAD_Y + 52))
    if (overflowX) narrow *= 0.9
  }

  let bb = boundsOfLaidOut(laidOut)

  /**
   * 在已塞进内边距的包络基础上，独立放大 X/Y 以吃满宽高（不改变拓扑，仅拉大坐标）；
   * 宽度先顶满、上下仍留空时能明显拉长纵距；两向均不超过 `FIT_MAX_SCALE`。
   */
  {
    const innerW = cw - 2 * FIT_MARGIN
    const innerH = Math.max(plotH - 2 * FIT_MARGIN, 80)
    const bw = Math.max(bb.maxX - bb.minX, 28)
    const bh = Math.max(bb.maxY - bb.minY, 28)

    let gx = (innerW * FIT_VIEWPORT_RATIO) / bw
    let gy = (innerH * FIT_VIEWPORT_RATIO) / bh
    gx = Math.min(Math.max(gx, 1), FIT_MAX_SCALE)
    gy = Math.min(Math.max(gy, 1), FIT_MAX_SCALE)

    if (gx > 1.008 || gy > 1.008) {
      const rcx = (bb.minX + bb.maxX) / 2
      const rcy = (bb.minY + bb.maxY) / 2
      for (const [id, p] of laidOut) {
        laidOut.set(id, {
          x: rcx + (p.x - rcx) * gx,
          y: rcy + (p.y - rcy) * gy,
        })
      }
    }
  }

  /** 同行标准号易叠字：按层聚类拉开圆心距，再等比缩放使包络贴合内框 */
  {
    const yBand = estimateYBandForRowClustering(laidOut)
    spreadHorizontalByRow(laidOut, yBand, GRAPH_MIN_NODE_CENTER_GAP, availWBase)
    bb = boundsOfLaidOut(laidOut)
    const innerW = cw - 2 * FIT_MARGIN
    const innerH = Math.max(plotH - 2 * FIT_MARGIN, 80)
    let bw = Math.max(bb.maxX - bb.minX, 24)
    let bh = Math.max(bb.maxY - bb.minY, 24)
    let sU = Math.min(innerW / bw, innerH / bh, FIT_MAX_SCALE) * FIT_VIEWPORT_RATIO
    if (!Number.isFinite(sU) || sU <= 0) sU = 1
    if (Math.abs(sU - 1) > 0.002) {
      const cx = (bb.minX + bb.maxX) / 2
      const cy = (bb.minY + bb.maxY) / 2
      scaleLaidOutUniform(laidOut, cx, cy, sU)
    }
  }

  /** 水平夹紧 + 在 [FIT_MARGIN, plotH-FIT_MARGIN] 内垂直居中内容包络 */
  bb = boundsOfLaidOut(laidOut)
  let dx = 0
  if (bb.minX < FIT_MARGIN) dx = FIT_MARGIN - bb.minX
  if (bb.maxX + dx > cw - FIT_MARGIN) dx += cw - FIT_MARGIN - (bb.maxX + dx)
  if (dx !== 0) {
    for (const [id, p] of laidOut) {
      laidOut.set(id, { x: p.x + dx, y: p.y })
    }
  }

  const innerTop = FIT_MARGIN
  const innerBot = () => plotH - FIT_MARGIN
  for (let k = 0; k < 8; k++) {
    bb = boundsOfLaidOut(laidOut)
    const top = innerTop
    const bottom = innerBot()
    const mid = (top + bottom) / 2
    let dy = mid - (bb.minY + bb.maxY) / 2
    for (const [id, p] of laidOut) {
      laidOut.set(id, { x: p.x, y: p.y + dy })
    }
    bb = boundsOfLaidOut(laidOut)
    if (bb.minY < top) {
      const fix = top - bb.minY
      for (const [id, p] of laidOut) {
        laidOut.set(id, { x: p.x, y: p.y + fix })
      }
      bb = boundsOfLaidOut(laidOut)
    }
    if (bb.maxY <= bottom + 0.5) break
    plotH = Math.max(plotH, Math.ceil(bb.maxY + FIT_MARGIN + 24))
  }

  bb = boundsOfLaidOut(laidOut)
  plotH = Math.max(plotH, Math.ceil(bb.maxY + PAD_Y + 32), minPlotHeightProp)

  return { positions: laidOut, width: cw, height: plotH }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 将 GET /api/get_tree_data/ 转为 ECharts graph：`layout:'none'`，**preset 坐标**（`layout_pos` 优先）；**非力导向**。 */
export default function PedigreeGraph({ nodes, links, centerBzId, loading, height = 560, onNodeClick }: PedigreeGraphProps) {
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
    const { positions, height: layoutH } = composeGraphLayouts(nodes, depth, cw, height)
    const nextH = Math.max(height, layoutH)
    setPlotHeight(nextH)

    const labelSideById = computeStaggeredLabelSides(positions)

    /** 统一一类目，不再按 ex_state 分色，避免「全图都在着色」 */
    const categories = [{ name: '谱系节点' }]

    const data = nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: PAD_X + cw / 2, y: PAD_Y }
      const labelTextRaw = `${(n.label != null && String(n.label).trim()) || (n.name?.trim() || n.id)}`.trim()
      const labelTextDisplay = labelTextRaw.length > 28 ? `${labelTextRaw.slice(0, 26)}…` : labelTextRaw
      const hi = Boolean(n.highlighted)
      const labelSide = labelSideById.get(n.id) ?? 'bottom'
      const neutralStyle = {
        color: '#d9d9d9',
        borderColor: '#b5b5b5',
        borderWidth: 1,
      }
      const highlightStyle = {
        color: '#1677ff',
        borderColor: '#0958d9',
        borderWidth: 1.5,
      }
      const std = n.std_name != null && String(n.std_name).trim() ? String(n.std_name).trim() : ''
      const tipLines = [
        escapeHtml(String(n.id)),
        `标准号：${escapeHtml(labelTextRaw)}`,
        ...(std ? [`标准名称：${escapeHtml(std)}`] : []),
        `状态：${escapeHtml(n.ex_state || '未知')}`,
      ]
      const fixed = true

      return {
        id: n.id,
        name: labelTextDisplay,
        x: pos.x,
        y: pos.y,
        fixed,
        symbolSize: hi ? 30 : 23,
        category: 0,
        value: labelTextRaw,
        itemStyle: hi ? highlightStyle : neutralStyle,
        label: {
          show: true,
          position: labelSide,
          distance: GRAPH_NODE_LABEL_DISTANCE,
          fontSize: 9,
          /** 画布单位；略收窄 + 省略，便于与 `GRAPH_MIN_NODE_CENTER_GAP` 一致、少叠字 */
          width: 100,
          overflow: 'truncate',
          color: hi ? '#0958d9' : 'rgba(0,0,0,0.75)',
          fontWeight: 500,
          ...(labelSide === 'top'
            ? { verticalAlign: 'bottom' as const }
            : { verticalAlign: 'top' as const }),
        },
        emphasis: {
          scale: false,
          label: { fontSize: 10 },
          itemStyle:
            hi
              ? { borderWidth: 2.2, borderColor: '#003eb3' }
              : { shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.1)' },
        },
        tooltip: {
          formatter: tipLines.join('<br/>'),
        },
      }
    })

    const relationLabel = (l: TreeLink) => {
      const t = (l.relation_type ?? '').trim() || '关系'
      return escapeHtml(t)
    }

    const graphLinks = safeLinks.map((l) => ({
      source: l.source,
      target: l.target,
      label: { show: false },
      lineStyle: {
        width: 0.75,
        curveness: 0.05,
        color: 'rgba(22,119,255,0.38)',
      },
      blur: {
        label: { show: false },
      },
      emphasis: {
        label: { show: false },
        lineStyle: { width: 1.05, opacity: 0.9 },
      },
      /** 仅在鼠标悬停在边上时浮动展示代替类型（无常态边上文字） */
      tooltip: {
        show: true,
        formatter: () =>
          `<div style="padding:2px 0"><strong>${relationLabel(l)}</strong><br/><span style="opacity:.75;font-size:12px">${escapeHtml(`${l.source} → ${l.target}`)}</span></div>`,
      },
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
        tooltip: {
          trigger: 'item',
          confine: true,
          hideDelay: 30,
          enterable: false,
        },
        legend: { show: false },
        animationDurationUpdate: 400,
        series: [
          {
            type: 'graph',
            layout: 'none',
            roam: true,
            scaleLimit: { min: 0.05, max: 14 },
            draggable: false,
            emphasis: {
              focus: 'adjacency',
              lineStyle: { width: 1.5, opacity: 0.9 },
            },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 6],
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
