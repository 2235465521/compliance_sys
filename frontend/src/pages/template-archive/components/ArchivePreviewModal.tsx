import { Modal, Typography } from 'antd'

type Props = {
  open: boolean
  title: string
  payload: unknown
  pdfUrl?: string
  onClose: () => void
}

export function ArchivePreviewModal({ open, title, payload, pdfUrl, onClose }: Props) {
  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width={900} className="tplarch-preview">
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        预览：支持 PDF 时在下方直接查看；其他类型以结构化信息展示。
      </Typography.Paragraph>
      {pdfUrl ? (
        <iframe
          title="pdf-preview"
          src={pdfUrl}
          style={{ width: '100%', height: 520, border: 'none', borderRadius: 8 }}
        />
      ) : (
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: '#0b1020',
            color: '#d6e4ff',
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 520,
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </Modal>
  )
}
