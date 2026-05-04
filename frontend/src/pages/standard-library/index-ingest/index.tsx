import {
  Button,
  Col,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  CloudUploadOutlined,
  EditOutlined,
  FileTextOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import { useCallback, useMemo, useState } from 'react'

const { Title, Text } = Typography

type IndexAuditStatus = 'pending' | 'approved' | 'rejected'

type IndexIngestRow = {
  id: string
  indicatorName: string
  indicatorValue: string
  status: IndexAuditStatus
  sourceFileName: string
}

const C = {
  workspaceBg: '#ffffff',
  surfaceContainerLow: '#e6f6ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#dbf1fe',
  primary: '#002854',
  onSurfaceVariant: '#43474f',
  outlineVariant: 'rgba(195, 198, 208, 0.45)',
  tableHeaderBg: '#f4f6f9',
  tableBorder: '#eef1f4',
  muted: '#64748b',
}

function ThLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: C.muted,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {children}
    </span>
  )
}

/** 模拟解析：按文件生成若干指标行（联调后端后替换为真实接口） */
function buildMockRowsForFiles(files: UploadFile[]): IndexIngestRow[] {
  const out: IndexIngestRow[] = []
  let seq = 0
  const templates = (label: string) => [
    {
      indicatorName: '范围',
      indicatorValue: `本标准规定了 ${label} 的术语定义、技术要求与检验规则（模拟数据）。`,
    },
    {
      indicatorName: '规范性引用文件',
      indicatorValue: 'GB/T 1.1—2020 标准化工作导则；其他引用文件略（模拟）。',
    },
    {
      indicatorName: '技术要求',
      indicatorValue: '外观：符合标准样品；主含量（质量分数）：≥99.0%（模拟）。',
    },
    {
      indicatorName: '检验规则',
      indicatorValue: '型式检验与出厂检验按第 6 章执行；抽样方案按附录 A（模拟）。',
    },
  ]

  for (const f of files) {
    const name = f.name || '未命名文件'
    const short = name.replace(/\.(pdf|docx|zip)$/i, '')
    for (const t of templates(short)) {
      seq += 1
      out.push({
        id: `mock-gb-${seq}-${f.uid}`,
        indicatorName: t.indicatorName,
        indicatorValue: t.indicatorValue,
        status: 'pending',
        sourceFileName: name,
      })
    }
  }
  return out
}

const statusMeta: Record<IndexAuditStatus, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'default' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已废止', color: 'error' },
}

/** 进入页面即可在表格中试编辑、通过/废止（与上传提取无关） */
const INITIAL_DEMO_ROWS: IndexIngestRow[] = [
  {
    id: 'demo-1',
    indicatorName: '范围',
    indicatorValue: '本标准规定了工业用氢氧化钠的技术要求、试验方法、检验规则及标志、包装、运输和贮存（演示数据，可点编辑修改）。',
    status: 'pending',
    sourceFileName: 'GB-T-209-2018_演示.pdf',
  },
  {
    id: 'demo-2',
    indicatorName: '主含量',
    indicatorValue: '氢氧化钠（NaOH）质量分数：≥32.0%（演示数据）。',
    status: 'pending',
    sourceFileName: 'GB-T-209-2018_演示.pdf',
  },
]

export default function StandardLibraryIndexIngestPage() {
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [rows, setRows] = useState<IndexIngestRow[]>(() => [...INITIAL_DEMO_ROWS])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ indicatorName: string; indicatorValue: string }>({
    indicatorName: '',
    indicatorValue: '',
  })

  const runMockExtract = useCallback(() => {
    if (fileList.length === 0) {
      message.warning('请先上传至少一个标准文件（模拟提取需要文件列表）。')
      return
    }
    const next = buildMockRowsForFiles(fileList)
    setRows(next)
    setEditingId(null)
    message.success(`已模拟提取 ${next.length} 条指标（已替换表格中的演示数据），请人工审核。`)
  }, [fileList])

  const approveAllPending = useCallback(() => {
    setRows((prev) => {
      const next = prev.map((r) => (r.status === 'pending' ? { ...r, status: 'approved' as const } : r))
      const n = prev.filter((r) => r.status === 'pending').length
      if (n === 0) message.info('没有待审核行。')
      else message.success(`已将 ${n} 条待审核设为已通过。`)
      return next
    })
  }, [])

  const rejectAllPending = useCallback(() => {
    setRows((prev) => {
      const next = prev.map((r) => (r.status === 'pending' ? { ...r, status: 'rejected' as const } : r))
      const n = prev.filter((r) => r.status === 'pending').length
      if (n === 0) message.info('没有待审核行。')
      else message.success(`已将 ${n} 条待审核设为已废止。`)
      return next
    })
  }, [])

  const startEdit = (row: IndexIngestRow) => {
    setEditingId(row.id)
    setEditDraft({ indicatorName: row.indicatorName, indicatorValue: row.indicatorValue })
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!editDraft.indicatorName.trim()) {
      message.warning('请填写指标名称。')
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === editingId
          ? {
              ...r,
              indicatorName: editDraft.indicatorName.trim(),
              indicatorValue: editDraft.indicatorValue.trim(),
            }
          : r,
      ),
    )
    setEditingId(null)
    message.success('已保存修改。')
  }

  const cancelEdit = () => setEditingId(null)

  const columns: ColumnsType<IndexIngestRow> = useMemo(
    () => [
      {
        title: <ThLabel>指标名称</ThLabel>,
        dataIndex: 'indicatorName',
        key: 'indicatorName',
        width: 160,
        render: (v: string, record) =>
          editingId === record.id ? (
            <Input
              size="small"
              value={editDraft.indicatorName}
              onChange={(e) => setEditDraft((d) => ({ ...d, indicatorName: e.target.value }))}
            />
          ) : (
            <span style={{ fontWeight: 600 }}>{v}</span>
          ),
      },
      {
        title: <ThLabel>指标内容</ThLabel>,
        dataIndex: 'indicatorValue',
        key: 'indicatorValue',
        ellipsis: true,
        render: (v: string, record) =>
          editingId === record.id ? (
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 5 }}
              value={editDraft.indicatorValue}
              onChange={(e) => setEditDraft((d) => ({ ...d, indicatorValue: e.target.value }))}
            />
          ) : (
            <Text style={{ color: C.onSurfaceVariant }}>{v}</Text>
          ),
      },
      {
        title: <ThLabel>审核状态</ThLabel>,
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (s: IndexAuditStatus) => {
          const m = statusMeta[s]
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: <ThLabel>来源文件</ThLabel>,
        dataIndex: 'sourceFileName',
        key: 'sourceFileName',
        width: 180,
        ellipsis: true,
      },
      {
        title: <ThLabel>操作</ThLabel>,
        key: 'actions',
        width: 200,
        fixed: 'right',
        render: (_, record) =>
          editingId === record.id ? (
            <Space size={6}>
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveEdit}>
                保存
              </Button>
              <Button size="small" onClick={cancelEdit}>
                取消
              </Button>
            </Space>
          ) : (
            <Space size={6} wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(record)}>
                编辑
              </Button>
              <Button
                size="small"
                type="primary"
                ghost
                disabled={record.status !== 'pending'}
                onClick={() => {
                  setRows((prev) =>
                    prev.map((r) => (r.id === record.id ? { ...r, status: 'approved' as const } : r)),
                  )
                  message.success('该行已设为通过。')
                }}
              >
                通过
              </Button>
              <Button
                size="small"
                danger
                disabled={record.status !== 'pending'}
                onClick={() => {
                  setRows((prev) =>
                    prev.map((r) => (r.id === record.id ? { ...r, status: 'rejected' as const } : r)),
                  )
                  message.success('该行已设为废止。')
                }}
              >
                废止
              </Button>
            </Space>
          ),
      },
    ],
    [editingId, editDraft.indicatorName, editDraft.indicatorValue],
  )

  return (
    <div style={{ background: C.workspaceBg, margin: -24, padding: '28px 32px 40px', minHeight: 'calc(100vh - 48px)' }}>
      <Row
        justify="space-between"
        align="middle"
        wrap
        style={{
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: `1px solid ${C.outlineVariant}`,
          rowGap: 16,
        }}
      >
        <Col>
          <Title level={2} style={SL_PAGE_TITLE}>
            国标指标入库
          </Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, maxWidth: 720 }}>
            上传国标文件，模拟提取指标后由人工审核；支持一键通过/一键废止与逐行编辑。正式解析接口联调后可替换「提取指标（模拟）」逻辑。
          </Text>
        </Col>
      </Row>

      <Space direction="vertical" size={32} style={{ width: '100%' }}>
        <section>
          <Upload.Dragger
            multiple
            accept=".pdf,.docx,.zip"
            showUploadList={{ showRemoveIcon: true }}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            beforeUpload={() => false}
            style={{ padding: 0, border: 'none', background: 'transparent' }}
          >
            <div
              style={{
                background: C.surfaceContainerLowest,
                borderRadius: 12,
                padding: '48px 28px',
                border: `1px dashed ${C.outlineVariant}`,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  margin: '0 auto 16px',
                  borderRadius: '50%',
                  background: C.surfaceContainer,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloudUploadOutlined style={{ fontSize: 36, color: C.primary }} />
              </div>
              <Title level={4} style={{ margin: '0 0 8px', color: C.primary, textAlign: 'center' }}>
                上传国标文件
              </Title>
              <Text style={{ display: 'block', textAlign: 'center', color: C.onSurfaceVariant, fontSize: 13 }}>
                支持 PDF、DOCX、ZIP；当前为演示流程，提取结果为模拟数据。
              </Text>
            </div>
          </Upload.Dragger>

          <Space wrap style={{ marginTop: 16 }}>
            <Button type="primary" icon={<FileTextOutlined />} onClick={runMockExtract}>
              提取指标（模拟）
            </Button>
            <Button onClick={approveAllPending}>一键通过（待审核）</Button>
            <Button danger onClick={rejectAllPending}>
              一键废止（待审核）
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              队列 {fileList.length} 个文件 · 指标行 {rows.length}
            </Text>
          </Space>
        </section>

        <section
          style={{
            background: '#fff',
            borderRadius: 16,
            border: `1px solid ${C.tableBorder}`,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 24px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
            padding: '0 0 12px',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.tableBorder}` }}>
            <Title level={5} style={{ margin: 0, color: C.primary }}>
              提取指标与人工审核
            </Title>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              默认已加载 2 条模拟指标（待审核），可直接点「编辑」修改后保存；上传并「提取指标」会替换为按文件生成的模拟结果。
            </Text>
          </div>
          <Table<IndexIngestRow>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 8, showSizeChanger: true }}
            locale={{
              emptyText: '暂无指标行：页面默认有 2 条演示数据；若已点击「提取指标」则被新结果替换。',
            }}
            scroll={{ x: 1000 }}
          />
        </section>
      </Space>
    </div>
  )
}
