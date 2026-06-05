import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  CaretDownOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MinusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { SL_PAGE_SUBTITLE, SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import './taxonomy.css'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  deleteIndustryTaxonomyItem,
  downloadIndustryTaxonomyTableImportTemplate,
  fetchIndustryTaxonomyTree,
  importIndustryTaxonomyTableTemplate,
  patchIndustryTaxonomyItem,
  queryIndustryClassification,
} from '@/services/standard-library'
import type { IndustryTaxonomyHit, IndustryTaxonomyTreeApiNode } from '@/types/standard-library'

const { Title, Text } = Typography

type TaxonomyLevel = 1 | 2 | 3

type TaxonomyTreeRow = {
  key: string
  /** 服务端主键；缺失时不可 PATCH/DELETE */
  backendId: string | number | null
  code: string
  name: string
  level: TaxonomyLevel
  /** ICS 编辑层级用；树展示层级仍用 depth 封顶 L3 */
  icsLevel?: number
  note: string
  /** CCS：父级分类号 */
  parentCode: string
  effective?: boolean
  children?: TaxonomyTreeRow[]
}

function initialExpandedKeys(nodes: TaxonomyTreeRow[]): Set<string> {
  const first = nodes[0]
  if (first?.children?.length) return new Set([first.key])
  return new Set()
}

/** 将接口嵌套节点转为面板用行树；层级深度超过 3 时折叠显示为 L3 */
function mapApiNodesToTaxonomyRows(
  nodes: IndustryTaxonomyTreeApiNode[] | null | undefined,
  scheme: 'ICS' | 'CCS',
  depth: number,
  pathPrefix: string,
): TaxonomyTreeRow[] {
  if (!nodes?.length) return []
  return nodes.map((raw, idx) => {
    const pathSeg = pathPrefix + String(idx)
    const codeRaw =
      scheme === 'ICS'
        ? raw.ics_code != null && String(raw.ics_code).trim() !== ''
          ? raw.ics_code
          : raw.code
        : raw.ccs_code != null && String(raw.ccs_code).trim() !== ''
          ? raw.ccs_code
          : raw.code
    const code = String(codeRaw ?? '').trim() || `(${pathSeg})`
    const nameRaw =
      scheme === 'ICS'
        ? raw.ics_name != null && String(raw.ics_name).trim() !== ''
          ? raw.ics_name
          : raw.name
        : raw.ccs_name != null && String(raw.ccs_name).trim() !== ''
          ? raw.ccs_name
          : raw.name
    const name = String(nameRaw ?? '').trim() || '（未命名）'
    const level = Math.min(depth + 1, 3) as TaxonomyLevel
    const idStr = raw.id != null ? String(raw.id).trim() : ''
    const backendId: string | number | null =
      raw.id == null || idStr === '' ? null : typeof raw.id === 'number' ? raw.id : idStr
    const key =
      idStr !== '' ? `${scheme}-id-${idStr.replace(/[^\w.-]/g, '_')}` : `${scheme}-n-${pathSeg.replace(/,/g, '-')}`

    const icsLevel =
      scheme === 'ICS'
        ? raw.ics_level != null && !Number.isNaN(Number(raw.ics_level))
          ? Number(raw.ics_level)
          : depth + 1
        : undefined

    const note = scheme === 'ICS' ? String(raw.ics_note ?? '').trim() : String(raw.ccs_note ?? '').trim()
    const parentCode = scheme === 'CCS' ? String(raw.parent_code ?? '').trim() : ''

    let effective: boolean | undefined
    if (raw.effective === true) effective = true
    else if (raw.effective === false) effective = false

    const childrenRaw = raw.children
    const children =
      childrenRaw && childrenRaw.length
        ? mapApiNodesToTaxonomyRows(childrenRaw, scheme, depth + 1, pathSeg + '-')
        : undefined

    return { key, backendId, code, name, level, icsLevel, note, parentCode, effective, children }
  })
}

function countTreeNodes(nodes: TaxonomyTreeRow[]): number {
  return nodes.reduce((acc, n) => acc + 1 + (n.children?.length ? countTreeNodes(n.children) : 0), 0)
}

function filterTreeByKeyword(nodes: TaxonomyTreeRow[], q: string): TaxonomyTreeRow[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return nodes
  const walk = (list: TaxonomyTreeRow[]): TaxonomyTreeRow[] => {
    const out: TaxonomyTreeRow[] = []
    for (const n of list) {
      const hitSelf =
        n.code.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle) || needle.includes(n.code.toLowerCase())
      const childFiltered = n.children ? walk(n.children) : []
      if (hitSelf || childFiltered.length) {
        out.push({
          ...n,
          children: childFiltered.length ? childFiltered : hitSelf ? n.children : undefined,
        })
      }
    }
    return out
  }
  return walk(nodes)
}

function onlyLevel1(nodes: TaxonomyTreeRow[]): TaxonomyTreeRow[] {
  return nodes.map(({ children: _c, ...rest }) => ({ ...rest, children: undefined }))
}

function onlyEffective(nodes: TaxonomyTreeRow[]): TaxonomyTreeRow[] {
  const walk = (list: TaxonomyTreeRow[]): TaxonomyTreeRow[] =>
    list
      .map((n) => {
        const kids = n.children ? walk(n.children) : undefined
        if (n.effective === false && (!kids || kids.length === 0)) return null
        return { ...n, children: kids && kids.length ? kids : undefined }
      })
      .filter(Boolean) as TaxonomyTreeRow[]
  return walk(nodes)
}

function formatNow(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type IcsEditSnap = { code: string; name: string; level: number; note: string }

type CcsEditSnap = { ccs_code: string; ccs_name: string; parent_code: string; ccs_note: string }

type EditMeta =
  | { scheme: 'ICS'; id: string | number; snap: IcsEditSnap }
  | { scheme: 'CCS'; id: string | number; snap: CcsEditSnap }

type TreePanelProps = {
  nodes: TaxonomyTreeRow[]
  expanded: Set<string>
  toggle: (key: string) => void
  onEdit: (node: TaxonomyTreeRow) => void
  onDelete: (node: TaxonomyTreeRow) => void
}

function TaxonomyTreePanel({ nodes, expanded, toggle, onEdit, onDelete }: TreePanelProps) {
  const renderRows = (list: TaxonomyTreeRow[], depth: number): ReactNode =>
    list.map((node) => {
      const hasKids = Boolean(node.children?.length)
      const open = expanded.has(node.key)
      const rowClass = [
        'taxonomy-tree-row',
        `taxonomy-tree-row--l${node.level}`,
        hasKids ? 'has-kids' : '',
        open ? 'is-open' : '',
      ]
        .filter(Boolean)
        .join(' ')

      return (
        <div key={node.key}>
          <div
            className={rowClass}
            role={hasKids ? 'button' : undefined}
            tabIndex={hasKids ? 0 : undefined}
            onClick={() => hasKids && toggle(node.key)}
            onKeyDown={(e) => hasKids && (e.key === 'Enter' || e.key === ' ') && toggle(node.key)}
          >
            <div className="taxonomy-tree-toggle">
              {hasKids ? (
                open ? (
                  <CaretDownOutlined />
                ) : (
                  <CaretRightOutlined />
                )
              ) : (
                <MinusOutlined style={{ fontSize: 11, opacity: 0.55 }} />
              )}
            </div>
            <div className="taxonomy-tree-code">{node.code}</div>
            <div className="taxonomy-tree-name">{node.name}</div>
            <div className="taxonomy-tree-level">
              <span className={`taxonomy-level-badge taxonomy-level-badge--${node.level}`}>{`L${node.level}`}</span>
            </div>
            <div className="taxonomy-tree-actions">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label="编辑"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(node)
                }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(node)
                }}
              />
            </div>
          </div>
          {hasKids && open ? (
            <div className="taxonomy-tree-children">{renderRows(node.children!, depth + 1)}</div>
          ) : null}
        </div>
      )
    })

  return <div className="taxonomy-tree-panel">{renderRows(nodes, 0)}</div>
}

export default function StandardLibraryTaxonomyPage() {
  const [activeScheme, setActiveScheme] = useState<'ICS' | 'CCS'>('ICS')
  const [searchText, setSearchText] = useState('')
  const [filterTag, setFilterTag] = useState<'level1' | 'withChildren' | 'currentOnly'>('withChildren')
  const [lastUpdated, setLastUpdated] = useState(() => formatNow())

  const [trees, setTrees] = useState<{ ICS: TaxonomyTreeRow[]; CCS: TaxonomyTreeRow[] }>({ ICS: [], CCS: [] })
  const [treeLoading, setTreeLoading] = useState(true)
  const [expandedByScheme, setExpandedByScheme] = useState<{ ICS: Set<string>; CCS: Set<string> }>({
    ICS: new Set(),
    CCS: new Set(),
  })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadScheme, setUploadScheme] = useState<'ICS' | 'CCS'>('ICS')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [templateDownloading, setTemplateDownloading] = useState(false)

  const [remoteRows, setRemoteRows] = useState<IndustryTaxonomyHit[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editScheme, setEditScheme] = useState<'ICS' | 'CCS'>('ICS')
  const [editSaving, setEditSaving] = useState(false)
  const [form] = Form.useForm()
  const editMetaRef = useRef<EditMeta | null>(null)

  const loadIndustryTrees = useCallback(async () => {
    setTreeLoading(true)
    try {
      const [icsApi, ccsApi] = await Promise.all([
        fetchIndustryTaxonomyTree('ICS'),
        fetchIndustryTaxonomyTree('CCS'),
      ])
      const icsRows = mapApiNodesToTaxonomyRows(icsApi, 'ICS', 0, '')
      const ccsRows = mapApiNodesToTaxonomyRows(ccsApi, 'CCS', 0, '')
      setTrees({ ICS: icsRows, CCS: ccsRows })
      setExpandedByScheme({
        ICS: initialExpandedKeys(icsRows),
        CCS: initialExpandedKeys(ccsRows),
      })
      setLastUpdated(formatNow())
    } catch (e) {
      message.error((e as Error).message || '加载分类树失败')
    } finally {
      setTreeLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadIndustryTrees()
  }, [loadIndustryTrees])

  const openEditTaxonomy = useCallback(
    (node: TaxonomyTreeRow) => {
      if (node.backendId == null) {
        message.warning('该节点缺少服务端主键 id，无法编辑')
        return
      }
      setEditScheme(activeScheme)
      if (activeScheme === 'ICS') {
        const snap: IcsEditSnap = {
          code: node.code,
          name: node.name,
          level: node.icsLevel ?? node.level,
          note: node.note,
        }
        editMetaRef.current = { scheme: 'ICS', id: node.backendId, snap }
        form.setFieldsValue(snap)
      } else {
        const snap: CcsEditSnap = {
          ccs_code: node.code,
          ccs_name: node.name,
          parent_code: node.parentCode,
          ccs_note: node.note,
        }
        editMetaRef.current = { scheme: 'CCS', id: node.backendId, snap }
        form.setFieldsValue(snap)
      }
      setEditOpen(true)
    },
    [activeScheme, form],
  )

  const submitEditTaxonomy = useCallback(async () => {
    const meta = editMetaRef.current
    if (!meta) return
    setEditSaving(true)
    try {
      const vals = await form.validateFields()
      let body: Record<string, unknown> = {}
      if (meta.scheme === 'ICS') {
        const snap = meta.snap
        const v = vals as IcsEditSnap
        const note = (v.note ?? '').trim()
        const snapNote = snap.note.trim()
        if (v.code !== snap.code) body.ics_code = v.code
        if (v.name !== snap.name) body.ics_name = v.name
        const lvl = Number(v.level)
        if (lvl !== snap.level) body.ics_level = lvl
        if (note !== snapNote) body.ics_note = note
      } else {
        const snap = meta.snap
        const v = vals as CcsEditSnap
        const t = (x: unknown) => String(x ?? '').trim()
        if (t(v.ccs_code) !== t(snap.ccs_code)) body.ccs_code = t(v.ccs_code)
        if (t(v.ccs_name) !== t(snap.ccs_name)) body.ccs_name = t(v.ccs_name)
        if (t(v.parent_code) !== t(snap.parent_code)) body.parent_code = t(v.parent_code)
        if (t(v.ccs_note) !== t(snap.ccs_note)) body.ccs_note = t(v.ccs_note)
      }
      if (Object.keys(body).length === 0) {
        message.info('没有修改')
        return
      }
      await patchIndustryTaxonomyItem(meta.id, meta.scheme, body)
      message.success('已保存')
      setEditOpen(false)
      editMetaRef.current = null
      form.resetFields()
      await loadIndustryTrees()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setEditSaving(false)
    }
  }, [form, loadIndustryTrees])

  const confirmDeleteTaxonomy = useCallback(
    (node: TaxonomyTreeRow) => {
      if (node.backendId == null) {
        message.warning('该节点缺少服务端主键 id，无法删除')
        return
      }
      const hasKids = Boolean(node.children?.length)
      Modal.confirm({
        title: '确认删除该分类？',
        content: hasKids
          ? '当前节点在树中仍有子级展示。删除父节点不会自动修改子节点的 parent_code，请谨慎操作。'
          : '删除后不可恢复（以服务端为准）。',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteIndustryTaxonomyItem(node.backendId!, activeScheme)
            message.success('已删除')
            await loadIndustryTrees()
          } catch (e) {
            message.error(e instanceof Error ? e.message : '删除失败')
          }
        },
      })
    },
    [activeScheme, loadIndustryTrees],
  )

  const toggleExpand = useCallback(
    (key: string) => {
      setExpandedByScheme((prev) => {
        const next = new Set(prev[activeScheme])
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return { ...prev, [activeScheme]: next }
      })
    },
    [activeScheme],
  )

  const baseTree = activeScheme === 'ICS' ? trees.ICS : trees.CCS
  const expanded = expandedByScheme[activeScheme]

  const displayTree = useMemo(() => {
    let t = baseTree
    if (filterTag === 'level1') t = onlyLevel1(t)
    else if (filterTag === 'currentOnly') t = onlyEffective(t)
    t = filterTreeByKeyword(t, searchText)
    return t
  }, [baseTree, filterTag, searchText])

  const dataCount = useMemo(() => countTreeNodes(displayTree), [displayTree])

  const tryRemoteSearch = useCallback(async () => {
    const q = searchText.trim()
    if (!q) {
      setRemoteRows([])
      return
    }
    setRemoteLoading(true)
    try {
      /** 仍传当前 Tab 的 scheme，与后端约定兼容（不影响检索结果）；展示合并 data.ics + data.ccs */
      const rows = await queryIndustryClassification(q, activeScheme)
      setRemoteRows(rows)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '查询失败')
      setRemoteRows([])
    } finally {
      setRemoteLoading(false)
    }
  }, [searchText, activeScheme])

  const handleDownloadTaxonomyTableTemplate = useCallback(async () => {
    setTemplateDownloading(true)
    try {
      await downloadIndustryTaxonomyTableImportTemplate(activeScheme, 'xlsx')
      message.success('模板已下载')
    } catch (e) {
      message.error(e instanceof Error ? e.message : '下载失败')
    } finally {
      setTemplateDownloading(false)
    }
  }, [activeScheme])

  const submitUpload = async () => {
    const file = fileList[0]?.originFileObj
    if (!file) {
      message.warning('请先选择数据表文件')
      return
    }
    setUploading(true)
    try {
      const stats = await importIndustryTaxonomyTableTemplate(file, uploadScheme)
      message.success(`本次处理 ${stats.processed} 条，新增 ${stats.created}、更新 ${stats.updated}`)
      setFileList([])
      setUploadOpen(false)
      await loadIndustryTrees()
    } catch (e) {
      const err = e as Error & { response?: { status?: number } }
      message.error(
        err.response?.status === 404
          ? '导入接口尚未在后端实现或路径不一致，请联调后再试。'
          : err.message || '上传失败',
      )
    } finally {
      setUploading(false)
    }
  }

  const filterOptions = [
    { label: '一级类目', value: 'level1' as const },
    { label: '含子类目', value: 'withChildren' as const },
    { label: '仅看现行', value: 'currentOnly' as const },
  ]

  const switchScheme = (scheme: 'ICS' | 'CCS') => {
    setActiveScheme(scheme)
    setRemoteRows([])
    setEditOpen(false)
    editMetaRef.current = null
    form.resetFields()
  }

  return (
    <div className="taxonomy-page">
      <div className="taxonomy-page-header">
        <div>
          <Title level={2} style={SL_PAGE_TITLE}>
            行业分类体系
          </Title>
          <Text style={SL_PAGE_SUBTITLE}>
            维护 ICS / CCS 行业分类树，支持精确检索、模板导入与节点编辑。
          </Text>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} loading={templateDownloading} onClick={() => void handleDownloadTaxonomyTableTemplate()}>
            下载模板
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => {
              setUploadScheme(activeScheme)
              setFileList([])
              setUploadOpen(true)
            }}
          >
            上传文件
          </Button>
        </Space>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={8}>
          <div className="taxonomy-sidebar">
            <Card className="taxonomy-card" size="small" title="分类体系">
              <Segmented
                block
                className="taxonomy-scheme-segmented"
                value={activeScheme}
                options={[
                  { label: 'ICS 国际标准', value: 'ICS' },
                  { label: 'CCS 中国标准', value: 'CCS' },
                ]}
                onChange={(v) => switchScheme(v as 'ICS' | 'CCS')}
              />
            </Card>

            <Card className="taxonomy-card taxonomy-card--accent" size="small" title="精确检索">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Input.Search
                  allowClear
                  className="taxonomy-search-input"
                  placeholder="输入分类号或分类名称"
                  value={searchText}
                  onChange={(e) => {
                    const v = e.target.value
                    setSearchText(v)
                    if (!v.trim()) setRemoteRows([])
                  }}
                  onSearch={() => void tryRemoteSearch()}
                  enterButton="检索"
                />
                <Segmented
                  block
                  className="taxonomy-filter-segmented"
                  value={filterTag}
                  options={filterOptions}
                  onChange={(v) => setFilterTag(v as typeof filterTag)}
                />
              </Space>
            </Card>

            <Card className="taxonomy-card" size="small" title="数据概览">
              <div className="taxonomy-stat-block">
                <div className="taxonomy-stat-label">当前筛选节点数</div>
                <div className="taxonomy-stat-value">{dataCount.toLocaleString('zh-CN')}</div>
                <div className="taxonomy-stat-meta">
                  <Space size={8} wrap>
                    <Tag color={activeScheme === 'ICS' ? 'blue' : 'purple'}>{activeScheme}</Tag>
                    <span>最后更新：{lastUpdated}</span>
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => void loadIndustryTrees()}>
                      刷新
                    </Button>
                  </Space>
                </div>
              </div>
            </Card>
          </div>
        </Col>

        <Col xs={24} lg={16}>
          <Card
            className="taxonomy-card taxonomy-tree-card"
            size="small"
            title={
              <Space size={8} wrap>
                <span>{activeScheme === 'ICS' ? 'ICS 国际标准分类' : 'CCS 中国标准分类'}</span>
                <Tag>{dataCount} 节点</Tag>
              </Space>
            }
          >
            {remoteRows.length > 0 ? (
              <div className="taxonomy-remote-panel">
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  接口检索结果（合并展示 ICS 与 CCS）
                </Text>
                <Table<IndustryTaxonomyHit>
                  size="small"
                  loading={remoteLoading}
                  rowKey={(r, i) => `${r.scheme}-${r.code}-${i}`}
                  dataSource={remoteRows}
                  pagination={{ pageSize: 6, size: 'small' }}
                  columns={[
                    { title: '体系', dataIndex: 'scheme', width: 64, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '分类号', dataIndex: 'code', width: 120, render: (v: string) => <Text code>{v}</Text> },
                    { title: '分类名称', dataIndex: 'name', ellipsis: true },
                  ]}
                />
              </div>
            ) : null}

            <div className="taxonomy-tree-head">
              <div style={{ width: 28 }} />
              <div style={{ width: 96 }}>分类号</div>
              <div style={{ flex: 1 }}>分类名称</div>
              <div style={{ width: 56, textAlign: 'right' }}>层级</div>
              <div style={{ width: 72, textAlign: 'right' }}>操作</div>
            </div>

            <Spin spinning={treeLoading}>
              {displayTree.length === 0 && !treeLoading ? (
                <div className="taxonomy-tree-empty">
                  <Empty description="暂无分类数据，请确认后端已导入或稍后刷新" />
                </div>
              ) : (
                <TaxonomyTreePanel
                  nodes={displayTree}
                  expanded={expanded}
                  toggle={toggleExpand}
                  onEdit={openEditTaxonomy}
                  onDelete={confirmDeleteTaxonomy}
                />
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      <Modal
        title={`编辑 ${editScheme} 分类`}
        open={editOpen}
        confirmLoading={editSaving}
        onCancel={() => {
          setEditOpen(false)
          editMetaRef.current = null
          form.resetFields()
        }}
        destroyOnClose
        onOk={() => void submitEditTaxonomy()}
        width={520}
      >
        <Form form={form} layout="vertical">
          {editScheme === 'ICS' ? (
            <>
              <Form.Item name="code" label="分类号" rules={[{ required: true, message: '请填写分类号' }]}>
                <Input placeholder="写入 ics_code" />
              </Form.Item>
              <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请填写名称' }]}>
                <Input placeholder="写入 ics_name" />
              </Form.Item>
              <Form.Item name="level" label="层级" rules={[{ required: true, message: '请填写层级' }]}>
                <InputNumber min={1} max={99} style={{ width: '100%' }} placeholder="写入 ics_level" />
              </Form.Item>
              <Form.Item name="note" label="注释">
                <Input.TextArea rows={3} placeholder="ics_note（可空）" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="ccs_code" label="分类号 (ccs_code)" rules={[{ required: true, message: '请填写分类号' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="ccs_name" label="分类名称 (ccs_name)" rules={[{ required: true, message: '请填写名称' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="parent_code" label="父级分类号 (parent_code)">
                <Input placeholder="可空" />
              </Form.Item>
              <Form.Item name="ccs_note" label="注释 (ccs_note)">
                <Input.TextArea rows={3} placeholder="可空" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title="上传分类表"
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false)
          setFileList([])
        }}
        width={520}
        footer={[
          <Button key="c" onClick={() => setUploadOpen(false)}>
            取消
          </Button>,
          <Button key="s" type="primary" loading={uploading} onClick={() => void submitUpload()}>
            提交到后端
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary" style={{ fontSize: 12 }}>
            请先使用顶部「下载模板」填写后再上传；弹窗内选择 ICS/CCS；具体写入规则以后端为准。
          </Text>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['ICS', 'CCS'] as const).map((s) => (
              <Button
                key={s}
                type={uploadScheme === s ? 'primary' : 'default'}
                onClick={() => setUploadScheme(s)}
                style={{ flex: 1 }}
              >
                {s}
              </Button>
            ))}
          </div>
          <Upload
            accept=".xlsx,.xls,.csv"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList([{ uid: file.uid, name: file.name, originFileObj: file }])
              return false
            }}
            onRemove={() => setFileList([])}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          <Text type="secondary">支持 Excel / CSV；成功与否以响应 body 内 code/msg 为准。</Text>
        </Space>
      </Modal>
    </div>
  )
}
