import { Button, Col, Input, Modal, Row, Space, Table, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  CaretDownOutlined,
  CaretRightOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MinusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { SL_PAGE_SUBTITLE, SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { importIndustryTaxonomySheet, queryIndustryClassification } from '@/services/standard-library'
import type { IndustryTaxonomyHit } from '@/types/standard-library'

const { Title, Text } = Typography

/** 参考样本：Material / 浅蓝工作台色板（与 Tailwind 样本对齐，不引入 tailwind 依赖） */
const C = {
  bg: '#ffffff',
  primary: '#002854',
  onPrimary: '#ffffff',
  primaryContainer: '#1b3e6e',
  onPrimaryContainer: '#d6e3ff',
  surfaceLowest: '#ffffff',
  surfaceLow: '#e6f6ff',
  surfaceVariant: '#cfe6f2',
  surfaceBright: '#ffffff',
  outlineVariant: 'rgba(195, 198, 208, 0.55)',
  onSurface: '#071e27',
  onSurfaceVariant: '#43474f',
  secondary: '#48626e',
  secondaryContainer: '#cbe7f5',
  onSecondaryContainer: '#4e6874',
  primaryFixed: '#d6e3ff',
  onPrimaryFixedVariant: '#254777',
  error: '#ba1a1a',
}

type TaxonomyLevel = 1 | 2 | 3

type TaxonomyTreeRow = {
  key: string
  code: string
  name: string
  level: TaxonomyLevel
  effective?: boolean
  children?: TaxonomyTreeRow[]
}

/** 演示树（与参考 HTML 文案接近；联调后可换接口数据） */
const MOCK_ICS_TREE: TaxonomyTreeRow[] = [
  {
    key: 'ics-01',
    code: '01',
    name: '综合、术语学、标准化、文献',
    level: 1,
    effective: true,
    children: [
      { key: 'ics-01-040', code: '01.040', name: '词汇、符号与信息编码', level: 2, effective: true },
      { key: 'ics-01-120', code: '01.120', name: '标准化总则与文献', level: 2, effective: true },
    ],
  },
  {
    key: 'ics-03',
    code: '03',
    name: '社会学、服务、公司（企业）的组织和管理、行政、运输',
    level: 1,
    effective: true,
    children: [
      { key: 'ics-03-020', code: '03.020', name: '社会学、人口统计学', level: 2, effective: true },
      {
        key: 'ics-03-040',
        code: '03.040',
        name: '劳动、就业',
        level: 2,
        effective: true,
        children: [
          { key: 'ics-03-040-01', code: '03.040.01', name: '劳动、就业综合', level: 3, effective: true },
          { key: 'ics-03-040-99', code: '03.040.99', name: '有关劳动和就业的其他标准', level: 3, effective: true },
        ],
      },
      { key: 'ics-03-060', code: '03.060', name: '金融、银行、货币体系、保险', level: 2, effective: true },
    ],
  },
  {
    key: 'ics-07',
    code: '07',
    name: '数学、自然科学',
    level: 1,
    effective: true,
    children: [{ key: 'ics-07-010', code: '07.010', name: '数学', level: 2, effective: true }],
  },
]

const MOCK_CCS_TREE: TaxonomyTreeRow[] = [
  {
    key: 'ccs-00',
    code: '00',
    name: '综合、术语、符号',
    level: 1,
    effective: true,
    children: [
      { key: 'ccs-00-01', code: '00.01', name: '综合、术语', level: 2, effective: true },
      { key: 'ccs-00-03', code: '00.03', name: '文献、信息', level: 2, effective: true },
    ],
  },
  {
    key: 'ccs-13',
    code: '13',
    name: '化工',
    level: 1,
    effective: true,
    children: [
      {
        key: 'ccs-13-10',
        code: '13.10',
        name: '无机化学原料',
        level: 2,
        effective: true,
        children: [
          { key: 'ccs-13-10-01', code: '13.10.01', name: '酸类', level: 3, effective: true },
          { key: 'ccs-13-10-02', code: '13.10.02', name: '碱类', level: 3, effective: false },
        ],
      },
    ],
  },
]

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

function levelBadge(level: TaxonomyLevel): CSSProperties {
  if (level === 1)
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: C.primaryFixed,
      color: C.onPrimaryFixedVariant,
    }
  if (level === 2)
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      background: C.secondaryContainer,
      color: C.onSecondaryContainer,
    }
  return {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 500,
    background: C.surfaceVariant,
    color: C.onSurfaceVariant,
  }
}

type TreePanelProps = {
  nodes: TaxonomyTreeRow[]
  expanded: Set<string>
  toggle: (key: string) => void
  hoverKey: string | null
  setHoverKey: (k: string | null) => void
}

function TaxonomyTreePanel({ nodes, expanded, toggle, hoverKey, setHoverKey }: TreePanelProps) {
  const renderRows = (list: TaxonomyTreeRow[], depth: number): ReactNode =>
    list.map((node) => {
      const hasKids = Boolean(node.children?.length)
      const open = expanded.has(node.key)
      const isL1 = node.level === 1
      const isL3 = node.level === 3
      const rowPad = isL1 ? '12px 16px' : isL3 ? '6px 16px 6px 28px' : '8px 16px 8px 20px'
      const codeSize = isL3 ? 12 : 14
      const nameSize = isL3 ? 12 : 14
      const codeColor = isL1 ? C.primary : isL3 ? C.secondary : C.onSurfaceVariant
      const nameWeight = isL1 ? 500 : 400

      return (
        <div key={node.key} style={{ marginBottom: isL1 ? 8 : 0 }}>
          <div
            role={hasKids ? 'button' : undefined}
            tabIndex={hasKids ? 0 : undefined}
            onClick={() => hasKids && toggle(node.key)}
            onKeyDown={(e) => hasKids && (e.key === 'Enter' || e.key === ' ') && toggle(node.key)}
            onMouseEnter={() => setHoverKey(node.key)}
            onMouseLeave={() => setHoverKey(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: rowPad,
              borderRadius: isL1 ? 12 : 8,
              background: isL1 ? C.surfaceBright : open && hasKids ? 'rgba(0,0,0,0.04)' : 'transparent',
              border: isL1 ? '1px solid transparent' : 'none',
              boxShadow: open && hasKids && isL1 ? '0 2px 8px rgba(0,0,0,0.02)' : undefined,
              borderColor: open && hasKids ? C.outlineVariant : undefined,
              cursor: hasKids ? 'pointer' : 'default',
              transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
            }}
          >
            <div style={{ width: 32, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              {hasKids ? (
                open ? (
                  <CaretDownOutlined style={{ color: isL1 ? C.primary : C.secondary, fontSize: 14 }} />
                ) : (
                  <CaretRightOutlined style={{ color: C.primary, fontSize: 14 }} />
                )
              ) : (
                <MinusOutlined style={{ color: C.onSurfaceVariant, fontSize: 11, opacity: 0.65 }} />
              )}
            </div>
            <div
              style={{
                width: 96,
                flexShrink: 0,
                fontFamily: "'Manrope', 'Segoe UI', sans-serif",
                fontWeight: isL1 ? 700 : 700,
                fontSize: codeSize,
                color: codeColor,
              }}
            >
              {node.code}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: nameSize, fontWeight: nameWeight, color: C.onSurface }}>{node.name}</div>
            <div style={{ width: 96, textAlign: 'right', flexShrink: 0 }}>
              <span style={levelBadge(node.level)}>{`L${node.level}`}</span>
            </div>
            <div
              style={{
                width: 88,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 4,
                opacity: hoverKey === node.key ? 1 : 0,
                transition: 'opacity 0.15s',
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ fontSize: isL3 ? 12 : 14 }} />}
                onClick={(e) => {
                  e.stopPropagation()
                  message.info('编辑功能暂未实现')
                }}
              />
              {isL1 || node.level === 2 ? (
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                  onClick={(e) => {
                    e.stopPropagation()
                    message.info('删除功能暂未实现')
                  }}
                />
              ) : null}
            </div>
          </div>
          {hasKids && open ? (
            <div
              style={{
                marginLeft: 16,
                paddingLeft: 20,
                marginTop: 4,
                borderLeft: `1px solid ${C.outlineVariant}`,
                position: 'relative',
              }}
            >
              {renderRows(node.children!, depth + 1)}
            </div>
          ) : null}
        </div>
      )
    })

  return <div style={{ padding: 16 }}>{renderRows(nodes, 0)}</div>
}

export default function StandardLibraryTaxonomyPage() {
  const [activeScheme, setActiveScheme] = useState<'ICS' | 'CCS'>('ICS')
  const [searchText, setSearchText] = useState('')
  const [filterTag, setFilterTag] = useState<'level1' | 'withChildren' | 'currentOnly'>('withChildren')
  const [lastUpdated, setLastUpdated] = useState(() => formatNow())

  const [expanded, setExpanded] = useState(() => new Set<string>(['ics-03', 'ics-03-040']))

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadScheme, setUploadScheme] = useState<'ICS' | 'CCS'>('ICS')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)

  const [remoteRows, setRemoteRows] = useState<IndustryTaxonomyHit[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [hoverKey, setHoverKey] = useState<string | null>(null)

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }, [])

  const baseTree = activeScheme === 'ICS' ? MOCK_ICS_TREE : MOCK_CCS_TREE

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
      const rows = await queryIndustryClassification(q, activeScheme)
      setRemoteRows(rows)
    } catch {
      setRemoteRows([])
    } finally {
      setRemoteLoading(false)
    }
  }, [searchText, activeScheme])

  const downloadTemplate = () => {
    const header = '分类号,分类名称\n'
    const sample = activeScheme === 'ICS' ? '03.040,劳动、就业\n' : '13.10,无机化学原料\n'
    const blob = new Blob([header + sample], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeScheme}-行业分类导入模板.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('模板已下载')
  }

  const submitUpload = async () => {
    const file = fileList[0]?.originFileObj
    if (!file) {
      message.warning('请先选择数据表文件')
      return
    }
    setUploading(true)
    try {
      await importIndustryTaxonomySheet(file, uploadScheme)
      message.success(`${uploadScheme} 分类表已提交保存`)
      setFileList([])
      setUploadOpen(false)
      setLastUpdated(formatNow())
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

  const pill = (key: typeof filterTag, label: string) => {
    const active = filterTag === key
    return (
      <button
        type="button"
        key={key}
        onClick={() => setFilterTag(key)}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          background: active ? C.primaryContainer : C.surfaceVariant,
          color: active ? C.onPrimaryContainer : C.onSurfaceVariant,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        {label}
      </button>
    )
  }

  const cardBase: CSSProperties = {
    background: C.surfaceLowest,
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    padding: 16,
  }

  return (
    <div style={{ background: C.bg, margin: -24, padding: '32px 40px 48px', minHeight: 'calc(100vh - 48px)' }}>
      <Row justify="space-between" align="bottom" gutter={[24, 24]} style={{ marginBottom: 40 }}>
        <Col flex="auto">
          <Title level={2} style={SL_PAGE_TITLE}>
            行业分类体系
          </Title>
          <Text style={SL_PAGE_SUBTITLE}>管理与维护系统内支持的标准化分类体系数据。</Text>
        </Col>
        <Col>
          <Space size={16} wrap>
            <Button
              size="large"
              icon={<DownloadOutlined />}
              onClick={downloadTemplate}
              style={{
                height: 42,
                paddingLeft: 22,
                paddingRight: 22,
                borderRadius: 10,
                background: C.secondaryContainer,
                color: C.onSecondaryContainer,
                border: 'none',
                fontWeight: 500,
              }}
            >
              下载模板
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<UploadOutlined />}
              onClick={() => {
                setUploadScheme(activeScheme)
                setUploadOpen(true)
              }}
              style={{
                height: 42,
                paddingLeft: 22,
                paddingRight: 22,
                borderRadius: 10,
                fontWeight: 500,
                background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryContainer} 100%)`,
                border: 'none',
                boxShadow: '0 4px 14px rgba(0,40,84,0.15)',
              }}
            >
              上传行业分类表
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={32}>
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* ICS / CCS 双按钮（对齐样本 tabs card） */}
            <div style={{ ...cardBase, padding: 8, display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setActiveScheme('ICS')
                  setRemoteRows([])
                  setExpanded(new Set(['ics-03', 'ics-03-040']))
                }}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  textAlign: 'center',
                  background: activeScheme === 'ICS' ? C.primaryContainer : 'transparent',
                  color: activeScheme === 'ICS' ? C.onPrimaryContainer : C.onSurfaceVariant,
                  transition: 'all 0.2s',
                }}
              >
                ICS（国际标准分类）
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveScheme('CCS')
                  setRemoteRows([])
                  setExpanded(new Set(['ccs-13', 'ccs-13-10']))
                }}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: activeScheme === 'CCS' ? 600 : 500,
                  fontSize: 13,
                  textAlign: 'center',
                  background: activeScheme === 'CCS' ? C.primaryContainer : 'transparent',
                  color: activeScheme === 'CCS' ? C.onPrimaryContainer : C.onSurfaceVariant,
                  transition: 'all 0.2s',
                }}
              >
                CCS（中国标准分类）
              </button>
            </div>

            {/* 精确检索 */}
            <div style={{ ...cardBase, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Title level={5} style={{ margin: 0, color: C.primary, fontWeight: 700 }}>
                精确检索
              </Title>
              <div style={{ position: 'relative' }}>
                <SearchOutlined
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: C.onSurfaceVariant,
                    fontSize: 18,
                    zIndex: 1,
                  }}
                />
                <Input
                  allowClear
                  size="large"
                  placeholder="输入分类号或分类名称…"
                  value={searchText}
                  onChange={(e) => {
                    const v = e.target.value
                    setSearchText(v)
                    if (!v.trim()) setRemoteRows([])
                  }}
                  onPressEnter={() => void tryRemoteSearch()}
                  style={{
                    paddingLeft: 40,
                    borderRadius: '10px 10px 0 0',
                    border: 'none',
                    borderBottom: `1px solid ${C.outlineVariant}`,
                    background: C.surfaceBright,
                  }}
                />
              </div>
              <Space wrap size={8}>
                {pill('level1', '一级类目')}
                {pill('withChildren', '含子类目')}
                {pill('currentOnly', '仅看现行')}
              </Space>
            </div>

            {/* 数据量卡片 + 大图标装饰 */}
            <div style={{ ...cardBase, position: 'relative', overflow: 'hidden' }}>
              <DatabaseOutlined
                style={{
                  position: 'absolute',
                  right: -24,
                  top: -24,
                  fontSize: 120,
                  color: C.surfaceVariant,
                  opacity: 0.55,
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <Text style={{ fontSize: 11, color: C.secondary, letterSpacing: 1, textTransform: 'uppercase' }}>
                  当前体系数据量
                </Text>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 800,
                    color: C.primary,
                    marginTop: 4,
                    fontFamily: "'Manrope', 'Segoe UI', sans-serif",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {dataCount.toLocaleString('zh-CN')}
                </div>
                <Space size={6} style={{ marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    最后更新：{lastUpdated}
                  </Text>
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => setLastUpdated(formatNow())}>
                    刷新
                  </Button>
                </Space>
              </div>
            </div>
          </Space>
        </Col>

        <Col xs={24} lg={16}>
          <div
            style={{
              background: C.surfaceLowest,
              borderRadius: 16,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              border: `1px solid ${C.outlineVariant}`,
              overflow: 'hidden',
              minHeight: 480,
            }}
          >
            {remoteRows.length > 0 ? (
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surfaceVariant}`, background: C.surfaceLowest }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  接口检索结果（对照）
                </Text>
                <Table<IndustryTaxonomyHit>
                  size="small"
                  loading={remoteLoading}
                  rowKey={(r, i) => `${r.scheme}-${r.code}-${i}`}
                  dataSource={remoteRows}
                  pagination={{ pageSize: 6, size: 'small' }}
                  columns={[
                    { title: '体系', dataIndex: 'scheme', width: 64 },
                    { title: '分类号', dataIndex: 'code', width: 120 },
                    { title: '分类名称', dataIndex: 'name', ellipsis: true },
                  ]}
                />
              </div>
            ) : null}

            {/* 表头条：对齐样本 uppercase 小标签 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 24px',
                background: C.surfaceLowest,
                borderBottom: `1px solid ${C.surfaceVariant}`,
                fontSize: 11,
                fontWeight: 600,
                color: C.onSurfaceVariant,
                letterSpacing: 0.08,
                textTransform: 'uppercase',
              }}
            >
              <div style={{ width: 32 }} />
              <div style={{ width: 96 }}>分类号</div>
              <div style={{ flex: 1 }}>分类名称</div>
              <div style={{ width: 96, textAlign: 'right' }}>层级</div>
              <div style={{ width: 88, textAlign: 'right' }}>操作</div>
            </div>

            <TaxonomyTreePanel
              nodes={displayTree}
              expanded={expanded}
              toggle={toggleExpand}
              hoverKey={hoverKey}
              setHoverKey={setHoverKey}
            />
          </div>
        </Col>
      </Row>

      <Modal
        title="上传行业分类表"
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
          <Text type="secondary">支持 Excel / CSV；接口约定见项目文档。</Text>
        </Space>
      </Modal>
    </div>
  )
}
