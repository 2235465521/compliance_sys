import { Button, Input, Space, Table, Tooltip, Typography, Upload, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  CloudUploadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileOutlined,
  InboxOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import { useCallback, useMemo, useState } from 'react'
import './body.css'

const { Title, Text } = Typography

/** 与标准谱系等子页一致的白底 + 主色 */
const C = {
  workspaceBg: '#ffffff',
  surfaceContainerLow: '#e6f6ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#dbf1fe',
  surfaceVariant: '#cfe6f2',
  primary: '#002854',
  onSurfaceVariant: '#43474f',
  outlineVariant: 'rgba(195, 198, 208, 0.45)',
  tableHeaderBg: '#f4f6f9',
  tableRowHover: '#f8fafc',
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

function formatBytes(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(f: UploadFile) {
  const file = f.originFileObj as File | undefined
  const t = file?.lastModified ?? Date.now()
  try {
    return new Date(t).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

/** 与谱系页画布同级的水平占位：全宽、不在内部再套 max-width 收窄 */
const canvasBlock = { width: '100%' as const }

export default function StandardLibraryBodyIngestPage() {
  const [fileQueue, setFileQueue] = useState<UploadFile[]>([])
  const [queueSearch, setQueueSearch] = useState('')

  const removeFromQueue = useCallback((uid: string) => {
    setFileQueue((prev) => prev.filter((f) => f.uid !== uid))
  }, [])

  const filteredQueue = useMemo(() => {
    const q = queueSearch.trim().toLowerCase()
    if (!q) return fileQueue
    return fileQueue.filter((f) => f.name?.toLowerCase().includes(q))
  }, [fileQueue, queueSearch])

  const queueColumns: ColumnsType<UploadFile> = useMemo(
    () => [
      {
        title: <ThLabel>文件名</ThLabel>,
        key: 'name',
        ellipsis: true,
        render: (_, row) => (
          <Space size={12}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(145deg, #e8f0fe 0%, #dbeafe 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileOutlined style={{ color: C.primary, fontSize: 16 }} />
            </span>
            <span style={{ fontWeight: 500, color: '#0f172a', fontSize: 14 }}>{row.name}</span>
          </Space>
        ),
      },
      {
        title: <ThLabel>大小</ThLabel>,
        key: 'size',
        width: 110,
        align: 'left',
        render: (_, row) => (
          <span
            style={{
              color: C.onSurfaceVariant,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}
          >
            {formatBytes(row.size ?? (row.originFileObj as File | undefined)?.size)}
          </span>
        ),
      },
      {
        title: <ThLabel>加入时间</ThLabel>,
        key: 'time',
        width: 168,
        render: (_, row) => (
          <span style={{ color: C.onSurfaceVariant, fontSize: 13 }}>{formatTime(row)}</span>
        ),
      },
      {
        title: <ThLabel>状态</ThLabel>,
        key: 'status',
        width: 108,
        render: () => (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />
            待提交
          </span>
        ),
      },
      {
        title: <ThLabel>操作</ThLabel>,
        key: 'op',
        align: 'right',
        width: 132,
        render: (_, row) => (
          <span className="sl-ingest-queue-actions">
            <Space size={4}>
              <Tooltip title="查看解析结果（待对接）">
                <Button
                  type="text"
                  size="small"
                  className="sl-ingest-queue-btn"
                  icon={<EyeOutlined />}
                  onClick={() => message.info('解析结果查看待后端对接后展示。')}
                />
              </Tooltip>
              <Tooltip title="从队列移除">
                <Button type="text" size="small" danger className="sl-ingest-queue-btn" icon={<DeleteOutlined />} onClick={() => removeFromQueue(row.uid)} />
              </Tooltip>
            </Space>
          </span>
        ),
      },
    ],
    [removeFromQueue],
  )

  return (
    <div className="body-ingest-page">
      <div className="body-ingest-header">
        <div>
          <Title level={2} style={SL_PAGE_TITLE}>
            国标正文入库
          </Title>
          <Text className="body-ingest-subtitle">
            上传 PDF / DOCX / ZIP 进入待提交队列，联调后端后替换为真实解析接口。
          </Text>
        </div>
        <div className="body-ingest-search-wrap">
          <SearchOutlined className="body-ingest-search-icon" />
          <Input
            allowClear
            placeholder="筛选队列中的文件名…"
            value={queueSearch}
            onChange={(e) => setQueueSearch(e.target.value)}
            style={{
              paddingLeft: 36,
              borderRadius: 999,
              background: C.surfaceContainerLow,
              border: 'none',
              boxShadow: 'none',
            }}
          />
        </div>
      </div>

      <Space direction="vertical" size={40} style={{ ...canvasBlock }}>
        {/* 上传区：全宽，与谱系主区一致占满内容栏 */}
        <section style={canvasBlock}>
          <Upload.Dragger
            multiple
            accept=".pdf,.docx,.zip"
            showUploadList={false}
            fileList={fileQueue}
            beforeUpload={(file) => {
              setFileQueue((prev) => [...prev, { uid: file.uid, name: file.name, size: file.size, originFileObj: file }])
              return false
            }}
            style={{
              padding: 0,
              border: 'none',
              background: 'transparent',
            }}
          >
            <div
              style={{
                position: 'relative',
                background: C.surfaceContainerLowest,
                borderRadius: 12,
                padding: '56px 32px',
                border: `1px dashed ${C.outlineVariant}`,
                transition: 'border-color 0.25s',
                cursor: 'pointer',
              }}
              className="body-ingest-dropzone"
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  margin: '0 auto 20px',
                  borderRadius: '50%',
                  background: C.surfaceContainer,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloudUploadOutlined style={{ fontSize: 40, color: C.primary }} />
              </div>
              <Title level={3} style={{ margin: '0 0 8px', color: C.primary, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>
                拖拽文件至此，或点击上传
              </Title>
              <Text
                style={{
                  display: 'block',
                  textAlign: 'center',
                  maxWidth: 560,
                  margin: '0 auto',
                  color: C.onSurfaceVariant,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                支持 PDF、DOCX、ZIP 等格式的国标相关文件；单文件建议不超过 100MB。
              </Text>
            </div>
          </Upload.Dragger>
        </section>

        {/* 入库处理队列：现代数据表（浅表头带 + 行悬停 + 操作弱化至悬停） */}
        <section style={canvasBlock}>
          <style>{`
            .sl-ingest-queue-wrap {
              background: #ffffff;
              border-radius: 16px;
              border: 1px solid ${C.tableBorder};
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 24px rgba(15, 23, 42, 0.04);
              overflow: hidden;
            }
            .sl-ingest-queue-wrap .ant-table { background: transparent; }
            .sl-ingest-queue-wrap .ant-table-container { border-inline: none !important; }
            .sl-ingest-queue-wrap .ant-table-thead > tr > th {
              background: ${C.tableHeaderBg} !important;
              border-bottom: 1px solid ${C.tableBorder} !important;
              padding: 14px 20px !important;
              vertical-align: middle;
            }
            .sl-ingest-queue-wrap .ant-table-thead > tr > th::before { display: none !important; }
            .sl-ingest-queue-wrap .ant-table-tbody > tr > td {
              border-bottom: 1px solid ${C.tableBorder} !important;
              padding: 14px 20px !important;
              vertical-align: middle;
              transition: background 0.15s ease;
            }
            .sl-ingest-queue-wrap .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
            .sl-ingest-queue-wrap .ant-table-tbody > tr:hover > td {
              background: ${C.tableRowHover} !important;
            }
            .sl-ingest-queue-wrap .ant-table-tbody > tr:hover .sl-ingest-queue-actions {
              opacity: 1;
            }
            .sl-ingest-queue-actions {
              opacity: 0.45;
              transition: opacity 0.15s ease;
            }
            .sl-ingest-queue-wrap .sl-ingest-queue-btn {
              width: 34px;
              height: 34px;
              padding: 0;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border-radius: 10px;
            }
            .sl-ingest-queue-wrap .sl-ingest-queue-btn:hover {
              background: rgba(0, 40, 84, 0.06) !important;
            }
            .sl-ingest-queue-wrap .ant-empty { padding: 48px 24px; }
            .sl-ingest-queue-wrap .ant-pagination { margin: 16px 20px !important; }
          `}</style>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <Title level={4} style={{ margin: 0, color: C.primary, fontWeight: 700, fontFamily: "'Manrope', sans-serif", letterSpacing: '0.02em' }}>
                入库处理队列
              </Title>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                轻量表头与行悬停反馈；操作按钮在悬停时更清晰。
              </Text>
            </div>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: 'linear-gradient(180deg, #f1f5f9 0%, #e8eef5 100%)',
                color: '#334155',
                border: '1px solid #e2e8f0',
              }}
            >
              共 {fileQueue.length} 项
            </span>
          </div>

          <div className="sl-ingest-queue-wrap">
            <Table<UploadFile>
              rowKey="uid"
              size="middle"
              pagination={false}
              showHeader
              tableLayout="fixed"
              dataSource={filteredQueue}
              columns={queueColumns}
              locale={{
                emptyText: (
                  <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                    <InboxOutlined style={{ fontSize: 44, color: '#cbd5e1', marginBottom: 12 }} />
                    <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>暂无文件</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>使用上方拖拽区加入队列后即可在此管理</div>
                  </div>
                ),
              }}
            />
          </div>
        </section>
      </Space>
    </div>
  )
}
