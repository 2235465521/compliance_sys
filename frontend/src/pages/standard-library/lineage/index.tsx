import { Button, Col, Descriptions, Divider, Form, Input, Modal, Row, Typography, message } from 'antd'

import { CloseOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'

import { SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import PedigreeGraph from '@/pages/standard-library/components/PedigreeGraph'

import { checkLatest, fetchTreeData, patchPedigreeNode } from '@/services/standard-library'

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



function displayMetaCell(v: unknown): string {

  if (v == null) return '—'

  const s = String(v).trim()

  return s ? s : '—'

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

type PedigreeNodeEditFormVals = {
  stdName: string
  exState: string
  publishDate: string
  effectiveDate: string
  responsibleUnit: string
}

export default function StandardLibraryLineagePage() {

  const [bzId, setBzId] = useState('')

  const [queryLoading, setQueryLoading] = useState(false)

  const [latest, setLatest] = useState<CheckLatestOk | null>(null)

  const [nodes, setNodes] = useState<TreeNode[]>([])

  const [links, setLinks] = useState<TreeLink[]>([])

  /** GET get_tree_data/ 返回的现行最新号，优先于查新接口同义字段展示 */

  const [pedigreeRootStdCode, setPedigreeRootStdCode] = useState<string | null>(null)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)


  const preserveSelectIdRef = useRef<string | null>(null)


  const [showTopologyOverview, setShowTopologyOverview] = useState(false)


  const [editModalOpen, setEditModalOpen] = useState(false)

  const [editSaving, setEditSaving] = useState(false)

  const [editForm] = Form.useForm<PedigreeNodeEditFormVals>()

  const editInitialRef = useRef<PedigreeNodeEditFormVals | null>(null)



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

        const payload = treeRes.value

        setNodes(payload.nodes ?? [])

        setLinks(payload.links ?? [])

        const root = payload.pedigree_root_std_code

        setPedigreeRootStdCode(root != null && String(root).trim() ? String(root).trim() : null)

        setShowTopologyOverview(payload.node_panel?.show_topology_overview === true)

      } else {

        message.error(treeRes.reason instanceof Error ? treeRes.reason.message : '族谱加载失败')

        setNodes([])

        setLinks([])

        setPedigreeRootStdCode(null)

        setShowTopologyOverview(false)

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

    const preserved = preserveSelectIdRef.current

    if (preserved && nodes.some((n) => n.id === preserved)) {

      setSelectedNodeId(preserved)

      preserveSelectIdRef.current = null

      return

    }

    const q = bzId.trim()

    if (q && nodes.some((n) => n.id === q)) {

      setSelectedNodeId(q)

      return

    }

    setSelectedNodeId((prev) => (prev && nodes.some((n) => n.id === prev) ? prev : nodes[0]!.id))

  }, [nodes, bzId])



  const selectedNode = useMemo(

    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),

    [nodes, selectedNodeId],

  )



  const stats = useMemo(

    () => (selectedNodeId ? topologyStats(selectedNodeId, links) : null),

    [selectedNodeId, links],

  )



  const reloadTreeForCurrentQuery = useCallback(async () => {

    const q = bzId.trim()

    if (!q) return

    const payload = await fetchTreeData(q)

    setNodes(payload.nodes ?? [])

    setLinks(payload.links ?? [])

    const root = payload.pedigree_root_std_code

    setPedigreeRootStdCode(root != null && String(root).trim() ? String(root).trim() : null)

    setShowTopologyOverview(payload.node_panel?.show_topology_overview === true)

  }, [bzId])



  const openPedigreeNodeEditModal = useCallback(() => {

    if (!selectedNode) return

    const init: PedigreeNodeEditFormVals = {

      stdName: selectedNode.std_name != null ? String(selectedNode.std_name) : '',

      exState: selectedNode.ex_state ?? '',

      publishDate:

        selectedNode.publish_date != null && String(selectedNode.publish_date).trim()

          ? String(selectedNode.publish_date).trim().slice(0, 10)

          : '',

      effectiveDate:

        selectedNode.effective_date != null && String(selectedNode.effective_date).trim()

          ? String(selectedNode.effective_date).trim().slice(0, 10)

          : '',

      responsibleUnit: selectedNode.responsible_unit != null ? String(selectedNode.responsible_unit) : '',

    }

    editInitialRef.current = init

    editForm.setFieldsValue(init)

    setEditModalOpen(true)

  }, [selectedNode, editForm])



  const submitPedigreeNodeEdit = useCallback(async () => {

    if (!selectedNode) return Promise.reject()

    const init = editInitialRef.current

    if (!init) return Promise.reject()

    let vals: PedigreeNodeEditFormVals

    try {

      vals = await editForm.validateFields()

    } catch {

      return Promise.reject()

    }

    const trim = (s: string) => s.trim()

    const payload: Record<string, unknown> = { bzId: selectedNode.id }

    if (trim(vals.stdName) !== trim(init.stdName)) payload.stdName = trim(vals.stdName)

    if (trim(vals.exState) !== trim(init.exState)) payload.exState = trim(vals.exState)

    if (trim(vals.publishDate) !== trim(init.publishDate)) payload.publishDate = trim(vals.publishDate)

    if (trim(vals.effectiveDate) !== trim(init.effectiveDate)) payload.effectiveDate = trim(vals.effectiveDate)

    if (trim(vals.responsibleUnit) !== trim(init.responsibleUnit)) {

      payload.extension = { responsibleUnit: trim(vals.responsibleUnit) }

    }

    const changedKeys = Object.keys(payload).filter((k) => k !== 'bzId')

    if (changedKeys.length === 0) {

      message.info('没有修改')

      return Promise.reject()

    }

    setEditSaving(true)

    try {

      await patchPedigreeNode(payload)

      message.success('已保存')

      setEditModalOpen(false)

      preserveSelectIdRef.current = selectedNode.id

      await reloadTreeForCurrentQuery()

    } catch (e) {

      message.error(e instanceof Error ? e.message : '保存失败')

      throw e

    } finally {

      setEditSaving(false)

    }

  }, [selectedNode, editForm, reloadTreeForCurrentQuery])



  /** 现行最新号：优先族谱接口 `pedigree_root_std_code`，其次查新 `current_latest_id` */

  const displayLatestStdCode = useMemo(() => {

    if (pedigreeRootStdCode) return pedigreeRootStdCode

    const q = bzId.trim()

    if (latest && q && latest.query_bz_id === q) {

      const c = String(latest.current_latest_id ?? '').trim()

      if (c) return c

    }

    return '—'

  }, [pedigreeRootStdCode, latest, bzId])



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

    <>

    <div style={{ background: C.workspaceBg, margin: -24, padding: '28px 32px 40px', minHeight: 'calc(100vh - 48px)' }}>

      <div style={{ marginBottom: 28 }}>

        <Title level={2} style={SL_PAGE_TITLE}>

          标准谱系探索

        </Title>

      </div>



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

                  输入标准号并点击「检索」，将在此展示可漫游的谱系图谱；点击节点可在右侧查看属性与发展脉络。

                </div>

              ) : (

                <PedigreeGraph

                  nodes={nodes}

                  links={links}

                  centerBzId={bzId.trim()}

                  loading={queryLoading}

                  height={620}

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

                  检索加载族谱后，点击图谱中的节点，即可在此查看标准号、状态与发展脉络摘要。

                </Text>

              ) : (

                <>

                  <div>

                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 1, textTransform: 'uppercase' }}>

                      标识与状态

                    </Text>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>

                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700, color: C.primary }}>

                        {selectedNode.id}

                      </span>

                      <span style={stateTagStyle(selectedNode.ex_state)}>{selectedNode.ex_state || '未知'}</span>

                    </div>

                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5, marginTop: 12, display: 'block' }}>

                      标准号（图谱主标签 · 与字段 name 一致）

                    </Text>

                    <Text style={{ fontFamily: 'ui-monospace, monospace', display: 'block', marginTop: 4, fontSize: 14, fontWeight: 600, color: C.onSurface }}>

                      {selectedNode.name?.trim() || '—'}

                    </Text>

                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5, marginTop: 12, display: 'block' }}>

                      标准名称（全称 · std_name）

                    </Text>

                    <Text

                      style={{

                        display: 'block',

                        marginTop: 4,

                        fontSize: 13,

                        color: selectedNode.std_name != null && String(selectedNode.std_name).trim() ? C.onSurface : C.onSurfaceVariant,

                        lineHeight: 1.5,

                      }}

                    >

                      {selectedNode.std_name != null && String(selectedNode.std_name).trim()

                        ? String(selectedNode.std_name).trim()

                        : '暂无'}

                    </Text>

                  </div>



                  <Divider style={{ margin: 0 }} />



                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 8px' }}>

                    <div>

                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>发布日期</Text>

                      <div style={{ fontSize: 13, color: C.onSurface, marginTop: 4 }}>{displayMetaCell(selectedNode.publish_date)}</div>

                    </div>

                    <div>

                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>生效日期</Text>

                      <div style={{ fontSize: 13, color: C.onSurface, marginTop: 4 }}>{displayMetaCell(selectedNode.effective_date)}</div>

                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>

                      <Text style={{ fontSize: 10, fontWeight: 700, color: C.outline, letterSpacing: 0.5 }}>归口单位</Text>

                      <div style={{ fontSize: 13, color: C.onSurface, marginTop: 4 }}>

                        {displayMetaCell(selectedNode.responsible_unit)}

                      </div>

                    </div>

                  </div>



                  <Divider style={{ margin: 0 }} />



                  {showTopologyOverview && stats ? (

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

                          <Descriptions.Item label="现行最新号">

                            <Text style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 600, color: C.primary }}>

                              {displayLatestStdCode}

                            </Text>

                          </Descriptions.Item>

                          <Descriptions.Item label="谱系链条">

                            <Text style={{ fontSize: 12 }}>

                              {latest.pedigree_chain?.length

                                ? latest.pedigree_chain.join(' → ')

                                : '—'}

                            </Text>

                          </Descriptions.Item>

                        </Descriptions>

                      </div>

                    </>

                  ) : null}

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

                disabled={!selectedNode}

                onClick={openPedigreeNodeEditModal}

              >

                编辑节点信息

              </Button>

            </div>

          </aside>

        </div>

      </div>

    </div>

    <Modal

      title="编辑节点信息"

      open={editModalOpen}

      onCancel={() => setEditModalOpen(false)}

      onOk={() => submitPedigreeNodeEdit()}

      confirmLoading={editSaving}

      destroyOnClose

      maskClosable={!editSaving}

      okText="保存"

      cancelText="取消"

    >

      <Form form={editForm} layout="vertical" autoComplete="off">

        <Form.Item name="stdName" label="标准名称">

          <Input placeholder="标准名称" allowClear />

        </Form.Item>

        <Form.Item name="exState" label="标准状态">

          <Input placeholder="如：现行 / 废止" allowClear />

        </Form.Item>

        <Form.Item name="publishDate" label="发布日期">

          <Input type="date" />

        </Form.Item>

        <Form.Item name="effectiveDate" label="生效日期">

          <Input type="date" />

        </Form.Item>

        <Form.Item name="responsibleUnit" label="归口单位">

          <Input placeholder="归口单位" allowClear />

        </Form.Item>

      </Form>

    </Modal>

    </>

  )

}

