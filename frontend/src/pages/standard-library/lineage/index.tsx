import {
  Button,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { SL_PAGE_SUBTITLE, SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import PedigreeGraph from '@/pages/standard-library/components/PedigreeGraph'
import {
  checkLatest,
  fetchTreeData,
  mutatePedigreeRelation,
  submitPedigreeRelationsBatch,
} from '@/services/standard-library'
import type { CheckLatestOk, TreeLink, TreeNode } from '@/types/standard-library'

const { Title, Text } = Typography

/** 白底工作台 + 主色；图谱区保留浅灰点阵便于阅读 */
const C = {
  workspaceBg: '#ffffff',
  canvasBg: '#fafbfc',
  gridDot: '#e2e8f0',
  statTileBg: '#f5f7fa',
  primary: '#002854',
  primaryContainer: '#1b3e6e',
  onPrimary: '#ffffff',
  surfaceLowest: '#ffffff',
  surfaceLow: '#e6f6ff',
  surfaceContainer: '#dbf1fe',
  outlineVariant: 'rgba(195, 198, 208, 0.55)',
  outline: '#747780',
  onSurface: '#071e27',
  onSurfaceVariant: '#43474f',
  secondaryContainer: '#cbe7f5',
  onSecondaryContainer: '#4e6874',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
}

const RELATION_TYPE_OPTIONS = [
  { label: '全部代替', value: '全部代替' },
  { label: '部分代替', value: '部分代替' },
  { label: '修订', value: '修订' },
  { label: '废止', value: '废止' },
  { label: '引用', value: '引用' },
  { label: '其他', value: '其他' },
]

type DraftRow = { key: string; source: string; target: string; relation_type: string }

function newDraftKey(): string {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseRelationCsv(text: string): { source: string; target: string; relation_type: string }[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  let start = 0
  if (lines.length && (/起点|源标准|source/i.test(lines[0]) || /终点|target/i.test(lines[0]))) {
    start = 1
  }
  const out: { source: string; target: string; relation_type: string }[] = []
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i]
      .split(/[,，\t]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      out.push({
        source: parts[0],
        target: parts[1],
        relation_type: parts[2] || '全部代替',
      })
    }
  }
  return out
}

function apiErrorHint(e: unknown): string {
  const err = e as Error & { response?: { status?: number } }
  if (err.response?.status === 404) {
    return '谱系写库接口尚未在后端实现或路径不一致，请联调后再试。'
  }
  return err.message || '请求失败'
}

/** 基于当前 links 的拓扑统计（用于侧栏「发展脉络」概览） */
function topologyStats(nodeId: string, links: TreeLink[]) {
  const rel = (s: string) => s || ''
  const isReplaceLike = (t: string) => /代替|修订/.test(rel(t))
  /** 作为「新标准」被上游指向的边（历史前驱 / 被替代链） */
  const upstreamReplace = links.filter((l) => l.target === nodeId && isReplaceLike(l.relation_type))
  /** 作为「旧标准」指向下游的替代类边 */
  const downstreamReplace = links.filter((l) => l.source === nodeId && isReplaceLike(l.relation_type))
  const citations = links.filter((l) => rel(l.relation_type) === '引用' && (l.source === nodeId || l.target === nodeId))
  return {
    upstreamReplace: upstreamReplace.length,
    downstreamReplace: downstreamReplace.length,
    citations: citations.length,
  }
}

function stateTagStyle(ex?: string): CSSProperties {
  const s = ex || ''
  if (/现行|有效/.test(s)) {
    return {
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 999,
      background: '#e6f4ea',
      color: '#137333',
      border: '1px solid #ceead6',
    }
  }
  if (/废止|失效/.test(s)) {
    return {
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 6,
      background: C.surfaceContainer,
      color: C.onSurfaceVariant,
    }
  }
  if (/即将|草案|计划/.test(s)) {
    return {
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 6,
      background: '#ffdcc6',
      color: '#723600',
      border: '1px dashed rgba(101, 47, 0, 0.35)',
    }
  }
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 6,
    background: C.secondaryContainer,
    color: C.onSecondaryContainer,
  }
}

export default function StandardLibraryLineagePage() {
  const [bzId, setBzId] = useState('')
  const [queryLoading, setQueryLoading] = useState(false)
  const [latest, setLatest] = useState<CheckLatestOk | null>(null)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [links, setLinks] = useState<TreeLink[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const [singleDrawerOpen, setSingleDrawerOpen] = useState(false)
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false)

  const [createForm] = Form.useForm<{ source: string; target: string; relation_type: string }>()
  const [editForm] = Form.useForm<{ relation_type: string }>()
  const [editLink, setEditLink] = useState<TreeLink | null>(null)
  const [singleSubmitting, setSingleSubmitting] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])

  const runPedigreeQuery = useCallback(async () => {
    const id = bzId.trim()
    if (!id) {
      message.warning('请输入标准号')
      return
    }
    setQueryLoading(true)
    try {
      const results = await Promise.allSettled([fetchTreeData(id), checkLatest(id)])
      const [treeRes, latestRes] = results
      if (treeRes.status === 'fulfilled') {
        setNodes(treeRes.value.nodes ?? [])
        setLinks(treeRes.value.links ?? [])
      } else {
        message.error(treeRes.reason instanceof Error ? treeRes.reason.message : '族谱加载失败')
        setNodes([])
        setLinks([])
      }
      if (latestRes.status === 'fulfilled') {
        setLatest(latestRes.value)
      } else {
        setLatest(null)
        message.warning(latestRes.reason instanceof Error ? latestRes.reason.message : '查新检查未完成')
      }
    } finally {
      setQueryLoading(false)
    }
  }, [bzId])

  useEffect(() => {
    if (!nodes.length) {
      setSelectedNodeId(null)
      return
    }
    const q = bzId.trim()
    if (q && nodes.some((n) => n.id === q)) {
      setSelectedNodeId(q)
      return
    }
    setSelectedNodeId((prev) => (prev && nodes.some((n) => n.id === prev) ? prev : nodes[0]!.id))
  }, [nodes, bzId])

  useEffect(() => {
    if (editLink) {
      editForm.setFieldsValue({ relation_type: editLink.relation_type || '全部代替' })
    }
  }, [editLink, editForm])

  const refreshAfterWrite = useCallback(async () => {
    if (bzId.trim()) {
      await runPedigreeQuery()
    }
  }, [bzId, runPedigreeQuery])

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  )

  const stats = useMemo(
    () => (selectedNodeId ? topologyStats(selectedNodeId, links) : null),
    [selectedNodeId, links],
  )

  const touchingLinks = useMemo(() => {
    if (!selectedNodeId) return []
    return links.filter((l) => l.source === selectedNodeId || l.target === selectedNodeId)
  }, [links, selectedNodeId])

  const openSingleWithSource = (sourceId?: string) => {
    createForm.resetFields()
    createForm.setFieldsValue({
      source: sourceId?.trim() || '',
      target: '',
      relation_type: '全部代替',
    })
    setSingleDrawerOpen(true)
  }

  const submitSingle = async () => {
    try {
      const v = await createForm.validateFields()
      if (!v.source?.trim() || !v.target?.trim()) {
        message.warning('请填写起点与终点标准号')
        return
      }
      setSingleSubmitting(true)
      await mutatePedigreeRelation({
        op: 'create',
        source: v.source.trim(),
        target: v.target.trim(),
        relation_type: v.relation_type || '全部代替',
      })
      message.success('单条关系已提交')
      createForm.resetFields()
      setSingleDrawerOpen(false)
      await refreshAfterWrite()
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return
      message.error(apiErrorHint(e))
    } finally {
      setSingleSubmitting(false)
    }
  }

  const submitBatchDraft = async () => {
    const items = draftRows
      .map((r) => ({
        source: r.source.trim(),
        target: r.target.trim(),
        relation_type: r.relation_type || '全部代替',
      }))
      .filter((r) => r.source && r.target)
    if (items.length === 0) {
      message.warning('请至少填写一行有效的起点与终点')
      return
    }
    setBatchSubmitting(true)
    try {
      await submitPedigreeRelationsBatch(items)
      message.success(`已批量提交 ${items.length} 条关系`)
      setDraftRows([])
      setBatchDrawerOpen(false)
      await refreshAfterWrite()
    } catch (e) {
      message.error(apiErrorHint(e))
    } finally {
      setBatchSubmitting(false)
    }
  }

  const onEditSave = async () => {
    if (!editLink) return
    try {
      const v = await editForm.validateFields()
      setEditSubmitting(true)
      await mutatePedigreeRelation({
        op: 'update',
        source: editLink.source,
        target: editLink.target,
        relation_type: v.relation_type,
      })
      message.success('修改已提交')
      setEditLink(null)
      await refreshAfterWrite()
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return
      message.error(apiErrorHint(e))
    } finally {
      setEditSubmitting(false)
    }
  }

  const onDeleteLink = async (row: TreeLink) => {
    try {
      await mutatePedigreeRelation({ op: 'delete', source: row.source, target: row.target })
      message.success('已提交删除')
      await refreshAfterWrite()
    } catch (e) {
      message.error(apiErrorHint(e))
    }
  }

  const updateDraft = (key: string, field: 'source' | 'target' | 'relation_type', value: string) => {
    setDraftRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const primaryBtn: CSSProperties = {
    height: 40,
    paddingLeft: 20,
    paddingRight: 20,
    borderRadius: 10,
    fontWeight: 600,
    background: C.primary,
    border: 'none',
    color: C.onPrimary,
    boxShadow: '0 1px 3px rgba(0,40,84,0.12)',
  }

  const secondaryTopBtn: CSSProperties = {
    height: 40,
    paddingLeft: 20,
    paddingRight: 20,
    borderRadius: 10,
    fontWeight: 600,
    background: C.secondaryContainer,
    color: C.onSecondaryContainer,
    border: 'none',
  }

  const diagramShell: CSSProperties = {
    flex: 1,
    minHeight: 420,
    overflow: 'auto',
    backgroundColor: C.canvasBg,
    backgroundImage: `radial-gradient(${C.gridDot} 1px, transparent 1px)`,
    backgroundSize: '24px 24px',
    padding: 24,
  }

  const leftCard: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 560,
    background: C.surfaceLowest,
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    border: `1px solid ${C.outlineVariant}`,
    overflow: 'hidden',
  }

  /** 左 : 右 = 4 : 6（图谱 40%，节点属性详情 60%） */
  const asideCard: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 200px)',
    background: C.surfaceLowest,
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    border: `1px solid ${C.outlineVariant}`,
    overflow: 'hidden',
  }

  return (
    <div style={{ background: C.workspaceBg, margin: -24, padding: '28px 32px 40px', minHeight: 'calc(100vh - 48px)' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 28 }}>
        <Col flex="auto">
          <Title level={2} style={SL_PAGE_TITLE}>
            标准谱系探索
          </Title>
          <Text style={SL_PAGE_SUBTITLE}>检索标准、在图谱中查看沿革与引用关系网，并在侧栏维护与该节点相关的谱系关系。</Text>
        </Col>
        <Col>
          <Space wrap>
            <Button style={secondaryTopBtn} icon={<UploadOutlined />} onClick={() => setBatchDrawerOpen(true)}>
              批量导入
            </Button>
            <Button type="primary" style={primaryBtn} icon={<PlusOutlined />} onClick={() => openSingleWithSource(undefined)}>
              单条录入
            </Button>
          </Space>
        </Col>
      </Row>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        <div style={{ flex: '2 1 260px', minWidth: 0, display: 'flex' }}>
          <div style={{ ...leftCard, width: '100%' }}>
            <div
              style={{
                padding: '20px 24px',
                background: 'rgba(230,246,255,0.45)',
                backdropFilter: 'blur(6px)',
                borderBottom: `1px solid ${C.outlineVariant}`,
              }}
            >
              <div style={{ position: 'relative', maxWidth: '100%', margin: '0 auto' }}>
                <SearchOutlined
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: C.outline,
                    fontSize: 20,
                    zIndex: 1,
                  }}
                />
                <Input
                  size="large"
                  value={bzId}
                  onChange={(e) => setBzId(e.target.value)}
                  placeholder="输入标准号进行检索（将加载族谱与查新）…"
                  onPressEnter={() => void runPedigreeQuery()}
                  style={{
                    paddingLeft: 48,
                    paddingRight: 120,
                    height: 52,
                    borderRadius: 12,
                    border: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                    fontSize: 15,
                  }}
                />
                <Button
                  type="primary"
                  loading={queryLoading}
                  onClick={() => void runPedigreeQuery()}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 36,
                    borderRadius: 10,
                    fontWeight: 600,
                    paddingLeft: 18,
                    paddingRight: 18,
                    background: C.primary,
                    border: 'none',
                  }}
                >
                  检索
                </Button>
              </div>
            </div>

            <div style={diagramShell}>
              {nodes.length === 0 && !queryLoading ? (
                <div
                  style={{
                    height: 360,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.onSurfaceVariant,
                    fontSize: 14,
                    textAlign: 'center',
                    padding: 24,
                  }}
                >
                  输入标准号并点击「检索」，将在此展示可漫游的谱系图谱；点击节点可在右侧查看属性与关联关系。
                </div>
              ) : (
                <PedigreeGraph
                  nodes={nodes}
                  links={links}
                  centerBzId={bzId.trim()}
                  loading={queryLoading}
                  height={480}
                  onNodeClick={(id) => setSelectedNodeId(id)}
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: '3 1 320px', minWidth: 0, display: 'flex' }}>
          <aside style={{ ...asideCard, width: '100%' }}>
            <div
              style={{
                padding: '16px 20px',
                background: C.surfaceLow,
                borderBottom: `1px solid ${C.surfaceContainer}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Title level={5} style={{ margin: 0, fontWeight: 700, color: C.onSurface, fontSize: 15 }}>
                节点属性详情
              </Title>
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label="清除选中"
                onClick={() => setSelectedNodeId(null)}
                disabled={!selectedNode}
              />
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!selectedNode ? (
                <Text style={{ color: C.onSurfaceVariant, fontSize: 13 }}>
                  检索加载族谱后，点击图谱中的节点，即可在此查看标准号、状态，并管理与本节点相连的谱系关系。
                </Text>
              ) : (
                <>
                  <div>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 1, textTransform: 'uppercase' }}>
                      标准编号
                    </Text>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700, color: C.primary }}>
                        {selectedNode.id}
                      </span>
                      <span style={stateTagStyle(selectedNode.ex_state)}>{selectedNode.ex_state || '未知'}</span>
                    </div>
                    <Text style={{ display: 'block', marginTop: 10, fontSize: 13, color: C.onSurface, lineHeight: 1.5 }}>
                      {selectedNode.name || '—'}
                    </Text>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 8px' }}>
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>发布 / 实施</Text>
                      <div style={{ fontSize: 13, color: C.onSurface, marginTop: 4 }}>—</div>
                    </div>
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>归口单位</Text>
                      <div style={{ fontSize: 13, color: C.onSurface, marginTop: 4 }}>—</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>数据说明</Text>
                      <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 4 }}>
                        元数据字段待接口扩展；当前展示族谱接口返回的节点信息。
                      </div>
                    </div>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  {stats ? (
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 1, textTransform: 'uppercase' }}>
                        拓扑关系概览
                      </Text>
                      <Row gutter={8} style={{ marginTop: 10 }}>
                        <Col span={8}>
                          <div
                            style={{
                              background: C.statTileBg,
                              borderRadius: 10,
                              padding: '10px 6px',
                              textAlign: 'center',
                              border: `1px solid ${C.outlineVariant}`,
                            }}
                          >
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.primary, fontFamily: "'Manrope', sans-serif" }}>
                              {stats.upstreamReplace}
                            </div>
                            <div style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 2 }}>上游沿革</div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div
                            style={{
                              background: C.statTileBg,
                              borderRadius: 10,
                              padding: '10px 6px',
                              textAlign: 'center',
                              border: `1px solid ${C.outlineVariant}`,
                            }}
                          >
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.primary, fontFamily: "'Manrope', sans-serif" }}>
                              {stats.citations}
                            </div>
                            <div style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 2 }}>引用</div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div
                            style={{
                              background: C.statTileBg,
                              borderRadius: 10,
                              padding: '10px 6px',
                              textAlign: 'center',
                              border: `1px solid ${C.outlineVariant}`,
                            }}
                          >
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.primary, fontFamily: "'Manrope', sans-serif" }}>
                              {stats.downstreamReplace}
                            </div>
                            <div style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 2 }}>下游替代</div>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  ) : null}

                  {latest && bzId.trim() && latest.query_bz_id === bzId.trim() ? (
                    <>
                      <Divider style={{ margin: 0 }} />
                      <div>
                        <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 1, textTransform: 'uppercase' }}>
                          检索标准 · 发展脉络（查新）
                        </Text>
                        <Descriptions column={1} size="small" bordered style={{ marginTop: 10 }}>
                          <Descriptions.Item label="现行最新">{String(latest.is_latest)}</Descriptions.Item>
                          <Descriptions.Item label="现行最新号">{latest.current_latest_id}</Descriptions.Item>
                          <Descriptions.Item label="谱系链条">
                            <Text style={{ fontSize: 12 }}>{latest.pedigree_chain}</Text>
                          </Descriptions.Item>
                        </Descriptions>
                      </div>
                    </>
                  ) : null}

                  <Divider style={{ margin: 0 }} />

                  <div>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 1, textTransform: 'uppercase' }}>
                      与本节点相关的谱系关系
                    </Text>
                    <Table<TreeLink>
                      style={{ marginTop: 10 }}
                      size="small"
                      rowKey={(r) => `${r.source}→${r.target}`}
                      pagination={touchingLinks.length > 6 ? { pageSize: 6, size: 'small' } : false}
                      dataSource={touchingLinks}
                      columns={[
                        {
                          title: '关系',
                          key: 'rel',
                          width: 72,
                          ellipsis: true,
                          render: (_, r) => <Text style={{ fontSize: 11 }}>{r.relation_type}</Text>,
                        },
                        {
                          title: '相邻标准',
                          key: 'adj',
                          ellipsis: true,
                          render: (_, r) => {
                            const other = r.source === selectedNode.id ? r.target : r.source
                            return (
                              <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 11 }} onClick={() => setSelectedNodeId(other)}>
                                {other}
                              </Button>
                            )
                          },
                        },
                        {
                          title: '',
                          key: 'op',
                          width: 88,
                          render: (_, row) => (
                            <Space size={0}>
                              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditLink(row)} />
                              <Popconfirm title="确定删除该关系？" onConfirm={() => void onDeleteLink(row)}>
                                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                padding: '12px 16px',
                background: C.surfaceLow,
                borderTop: `1px solid ${C.surfaceContainer}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <Button
                block
                type="primary"
                style={{ ...primaryBtn, height: 38 }}
                icon={<EditOutlined />}
                onClick={() => message.info('标准书目与元数据维护请在「标准入库与查询」模块进行。')}
              >
                编辑节点信息
              </Button>
              <Space.Compact style={{ width: '100%' }}>
                <Button
                  block
                  style={{ flex: 1, borderRadius: 10, height: 38, fontWeight: 600, borderColor: C.outlineVariant }}
                  icon={<LinkOutlined />}
                  disabled={!selectedNode}
                  onClick={() => openSingleWithSource(selectedNode?.id)}
                >
                  新增关联
                </Button>
                <Button
                  style={{ width: 44, height: 38, borderRadius: 10, color: C.error, borderColor: C.errorContainer }}
                  icon={<DeleteOutlined />}
                  disabled={!selectedNode}
                  title="请在上方表格中删除具体关系"
                  onClick={() => message.info('请在「与本节点相关的谱系关系」列表中选择具体边并删除。')}
                />
              </Space.Compact>
            </div>
          </aside>
        </div>
      </div>

      <Drawer title="单条录入谱系关系" width={440} open={singleDrawerOpen} onClose={() => setSingleDrawerOpen(false)} destroyOnClose>
        <Form form={createForm} layout="vertical" initialValues={{ relation_type: '全部代替' }}>
          <Form.Item name="source" label="起点标准号" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="父标准 / 被替代方" />
          </Form.Item>
          <Form.Item name="target" label="终点标准号" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="子标准 / 替代方" />
          </Form.Item>
          <Form.Item name="relation_type" label="关系类型">
            <Select options={[...RELATION_TYPE_OPTIONS]} />
          </Form.Item>
          <Button type="primary" loading={singleSubmitting} onClick={() => void submitSingle()} style={primaryBtn}>
            提交到后端
          </Button>
        </Form>
      </Drawer>

      <Drawer title="批量导入谱系关系" width={720} open={batchDrawerOpen} onClose={() => setBatchDrawerOpen(false)} destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Button
              onClick={() => {
                setDraftRows((r) => [...r, { key: newDraftKey(), source: '', target: '', relation_type: '全部代替' }])
              }}
            >
              添加一行
            </Button>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = () => {
                  const text = String(reader.result ?? '')
                  const parsed = parseRelationCsv(text)
                  if (!parsed.length) {
                    message.warning('未解析到有效行，请使用「起点,终点[,关系类型]」格式')
                    return
                  }
                  setDraftRows(parsed.map((p) => ({ ...p, key: newDraftKey() })))
                  message.success(`已导入 ${parsed.length} 行，请核对后提交`)
                }
                reader.readAsText(file, 'UTF-8')
                return false
              }}
            >
              <Button icon={<UploadOutlined />}>导入 CSV</Button>
            </Upload>
            <Button
              type="link"
              onClick={() => {
                const sample = '起点,终点,关系类型\nGB/T 1.1-2020,GB/T 1.1-2024,全部代替\n'
                const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'pedigree-relations-template.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              下载 CSV 模板
            </Button>
            <Button type="primary" loading={batchSubmitting} onClick={() => void submitBatchDraft()} style={primaryBtn}>
              批量提交
            </Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 13 }}>
            批量接口约定：<Text code>POST /api/standards/pedigree/relations/batch/</Text>，body 为 <Text code>items</Text> 数组。
          </Text>
          <Table<DraftRow>
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={draftRows}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: '起点',
                dataIndex: 'source',
                render: (_, r) => (
                  <Input value={r.source} onChange={(e) => updateDraft(r.key, 'source', e.target.value)} placeholder="标准号" />
                ),
              },
              {
                title: '终点',
                dataIndex: 'target',
                render: (_, r) => (
                  <Input value={r.target} onChange={(e) => updateDraft(r.key, 'target', e.target.value)} placeholder="标准号" />
                ),
              },
              {
                title: '关系类型',
                dataIndex: 'relation_type',
                width: 160,
                render: (_, r) => (
                  <Select
                    style={{ width: '100%' }}
                    value={r.relation_type}
                    options={[...RELATION_TYPE_OPTIONS]}
                    onChange={(v) => updateDraft(r.key, 'relation_type', v)}
                  />
                ),
              },
              {
                title: '操作',
                width: 72,
                render: (_, r) => (
                  <Button type="link" danger size="small" onClick={() => setDraftRows((rows) => rows.filter((x) => x.key !== r.key))}>
                    移除
                  </Button>
                ),
              },
            ]}
          />
        </Space>
      </Drawer>

      <Modal
        title="修改关系类型"
        open={!!editLink}
        onCancel={() => setEditLink(null)}
        confirmLoading={editSubmitting}
        onOk={() => void onEditSave()}
        destroyOnClose
      >
        {editLink ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              {editLink.source} → {editLink.target}
            </Text>
            <Form form={editForm} layout="vertical">
              <Form.Item name="relation_type" label="关系类型" rules={[{ required: true }]}>
                <Select options={[...RELATION_TYPE_OPTIONS]} />
              </Form.Item>
            </Form>
            <Text type="secondary" style={{ fontSize: 12 }}>
              单条写库约定：<Text code>POST /api/standards/pedigree/relation-mutation/</Text>，<Text code>op=update</Text>。
            </Text>
          </Space>
        ) : null}
      </Modal>
    </div>
  )
}
