import { DeleteOutlined, FileOutlined, FilePdfOutlined, FileWordOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import type { ReactNode } from 'react'

const { Text } = Typography

function formatFileSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeIcon(name: string): ReactNode {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    return <FilePdfOutlined style={{ fontSize: 20, color: '#cf1322' }} />
  }
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return <FileWordOutlined style={{ fontSize: 20, color: '#1677ff' }} />
  }
  return <FileOutlined style={{ fontSize: 20, color: '#597ef7' }} />
}

type Props = {
  files: UploadFile[]
  onRemove: (uid: string) => void
  onClearAll: () => void
}

export default function PendingUploadFileList({ files, onRemove, onClearAll }: Props) {
  if (files.length === 0) return null

  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0)

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        background: '#fafafa',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid #e8e8e8',
          background: '#fff',
        }}
      >
        <div>
          <Text strong style={{ fontSize: 15 }}>
            已选择 {files.length} 个文件
          </Text>
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 13 }}>
            合计 {formatFileSize(totalBytes)}
          </Text>
        </div>
        <Button type="link" danger size="small" onClick={onClearAll} style={{ padding: 0, height: 'auto' }}>
          清空全部
        </Button>
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxHeight: 280,
          overflowY: 'auto',
        }}
      >
        {files.map((file, index) => (
          <li
            key={file.uid}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              background: index % 2 === 0 ? '#fff' : '#fafafa',
              borderBottom: index < files.length - 1 ? '1px solid #f0f0f0' : undefined,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: 8,
                background: '#f5f5f5',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {fileTypeIcon(file.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text
                ellipsis={{ tooltip: file.name }}
                style={{ display: 'block', fontSize: 14, lineHeight: 1.45 }}
              >
                {file.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatFileSize(file.size)}
              </Text>
            </div>
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              aria-label={`移除 ${file.name}`}
              onClick={() => onRemove(file.uid)}
              style={{ flexShrink: 0, color: '#8c8c8c' }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
