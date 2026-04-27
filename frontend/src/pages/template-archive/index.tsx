import { Card, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { ArchiveAndDownloadsTab } from './components/ArchiveAndDownloadsTab'
import { ArchivePreviewModal } from './components/ArchivePreviewModal'
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
          在此管理报告模板；历史存档与已生成文件下载集中在「存档与下载」中查看。
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
              key: 'archive',
              label: '存档与下载',
              children: <ArchiveAndDownloadsTab onPreview={openPreview} />,
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
