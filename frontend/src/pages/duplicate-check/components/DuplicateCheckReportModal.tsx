import { Button, Descriptions, List, Modal, Space, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import type { DuplicateCheckHit, DuplicateCheckReport } from '@/types/duplicate-check'
import { downloadStandardPdfByBzId } from '@/services/duplicate-check'
import { useDuplicateCheckStore } from '@/stores/duplicate-check'

function extractBzId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const o = payload as Record<string, unknown>
  const rep = o.report
  if (rep && typeof rep === 'object' && 'taskId' in rep) {
    const id = (rep as DuplicateCheckReport).taskId
    if (typeof id === 'string' && id) return id
  }
  if (typeof o.taskId === 'string' && o.taskId) return o.taskId
  if (typeof o.id === 'string' && o.id) return o.id
  return undefined
}

function getReport(payload: unknown): DuplicateCheckReport | null {
  if (!payload || typeof payload !== 'object') return null
  const o = payload as DuplicateCheckHit
  if (o.report && typeof o.report === 'object') return o.report as DuplicateCheckReport
  const p = payload as Record<string, unknown>
  if ('summary' in p || 'overlapList' in p) return p as DuplicateCheckReport
  return null
}

export function DuplicateCheckReportModal() {
  const reportModal = useDuplicateCheckStore((s) => s.reportModal)
  const closeReport = useDuplicateCheckStore((s) => s.closeReport)
  const [loading, setLoading] = useState(false)

  const report = useMemo(() => getReport(reportModal.payload), [reportModal.payload])

  async function onDownloadStandardPdf() {
    const bzId = extractBzId(reportModal.payload)
    if (!bzId) {
      message.warning('缺少标准编号，无法下载。')
      return
    }
    setLoading(true)
    try {
      await downloadStandardPdfByBzId(bzId)
      message.success('下载已开始（若打不开，请确认文件为 PDF 且非 JSON 错误页）')
    } catch (e) {
      message.error(e instanceof Error ? e.message : '下载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={reportModal.title}
      open={reportModal.open}
      onCancel={() => closeReport()}
      footer={[
        <Button key="pdf" type="primary" loading={loading} onClick={() => void onDownloadStandardPdf()}>
          下载标准 PDF（库内原文）
        </Button>,
        <Button key="close" onClick={() => closeReport()}>
          关闭
        </Button>,
      ]}
      width={860}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          以下为本次命中记录的摘要。相似度数值由后端「字面名称查重」接口逐条返回；多条均为 85% 时多为后端对该批候选的计算结果，与是否填写关键词/大纲无必然对应（若不填，请求里只带拟建标准名称，匹配范围会不同）。
        </Typography.Paragraph>

        {report ? (
          <>
            {report.summary ? (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="摘要">{report.summary}</Descriptions.Item>
              </Descriptions>
            ) : null}
            {Array.isArray(report.overlapList) && report.overlapList.length > 0 ? (
              <div>
                <Typography.Text strong>重合条目</Typography.Text>
                <List
                  size="small"
                  bordered
                  style={{ marginTop: 8 }}
                  dataSource={report.overlapList}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <span>
                          {item.standardNo ? `${item.standardNo} ` : ''}
                          {item.name}
                        </span>
                        <Typography.Text type="secondary">
                          相似度：{item.similarity}%
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          「下载标准 PDF」使用接口 GET /api/standards/download-doc/?bz_id=…，下载的是<strong>标准全文</strong>；若库中无文件或返回错误 JSON，将无法作为 PDF 打开，界面会提示具体原因。
        </Typography.Text>

        <pre
          style={{
            margin: 0,
            padding: 12,
            background: '#0b1020',
            color: '#d6e4ff',
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 220,
            fontSize: 12,
          }}
        >
          {JSON.stringify(reportModal.payload, null, 2)}
        </pre>
      </Space>
    </Modal>
  )
}
