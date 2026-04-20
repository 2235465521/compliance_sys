import { Card, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { ArchivePreviewModal } from './components/ArchivePreviewModal'
import { DownloadCenterPanel } from './components/DownloadCenterPanel'
import { HistoryRecordsPanel } from './components/HistoryRecordsPanel'
import { TemplateConfigPanel } from './components/TemplateConfigPanel'

type PreviewState = {
  open: boolean
  title: string
  payload: unknown
  pdfUrl?: string
}

export default function TemplateArchivePage() {
  const [preview, setPreview] = useState<PreviewState>({
    open: false,
    title: '',
    payload: null,
    pdfUrl: undefined,
  })

  function openPreview(title: string, payload: unknown, pdfUrl?: string) {
    setPreview({ open: true, title, payload, pdfUrl })
  }

  return (
    <div className="tplarch-page">
      <Card className="tplarch-card tplarch-hero">
        <Typography.Title level={4} className="tplarch-page-title" style={{ marginTop: 0 }}>
          模板与存档
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          在此管理报告模板、查询历史存档记录，并在下载中心获取已生成的文件。
        </Typography.Paragraph>
      </Card>

      <Card className="tplarch-card" style={{ marginTop: 16 }}>
        <Tabs
          defaultActiveKey="templates"
          items={[
            {
              key: 'templates',
              label: '模板配置',
              children: <TemplateConfigPanel onPreview={openPreview} />,
            },
            {
              key: 'records',
              label: '历史记录',
              children: <HistoryRecordsPanel onPreview={openPreview} />,
            },
            {
              key: 'downloads',
              label: '下载中心',
              children: <DownloadCenterPanel onPreview={openPreview} />,
            },
          ]}
        />
      </Card>

      <ArchivePreviewModal
        open={preview.open}
        title={preview.title}
        payload={preview.payload}
        pdfUrl={preview.pdfUrl}
        onClose={() => setPreview((p) => ({ ...p, open: false }))}
      />
    </div>
  )
}
