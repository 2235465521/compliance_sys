import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Result, Spin, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { downloadArtifactFile, getStep1, listArtifacts } from '@/services/compliance-api'
import type { ArtifactItem, Step1Out } from '@/types/compliance-api'
import { getComplianceApiErrorMessage } from '@/utils/complianceApiError'

const { Paragraph, Text } = Typography

function pickUploadedArtifact(artifacts: ArtifactItem[]): ArtifactItem | null {
  return (
    artifacts.find((a) => a.kind === 'uploaded_qb') ??
    artifacts.find((a) => /upload|企标|qb/i.test(a.label ?? '')) ??
    artifacts[0] ??
    null
  )
}

function guessBlobMime(blob: Blob, fileName: string): string {
  if (blob.type && blob.type !== 'application/octet-stream') return blob.type
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.doc')) return 'application/msword'
  return blob.type || 'application/octet-stream'
}

export default function EnterpriseStandardDocumentPage() {
  const { taskId: taskIdParam } = useParams<{ taskId: string }>()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const taskId = Number(taskIdParam ?? search.get('task_id'))
  const [loading, setLoading] = useState(true)
  const [step1, setStep1] = useState<Step1Out | null>(null)
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null)
  const [fileMime, setFileMime] = useState<string>('')
  const [fileLabel, setFileLabel] = useState('')
  const [textContent, setTextContent] = useState<string | null>(null)
  const [emptyReason, setEmptyReason] = useState<string | null>(null)

  const parse = (step1?.parse_result ?? {}) as Record<string, unknown>
  const qbCode = useMemo(
    () => String(step1?.task.qb_code ?? parse.qb_code ?? '').trim(),
    [parse.qb_code, step1?.task.qb_code],
  )
  const load = useCallback(async () => {
    if (!Number.isFinite(taskId)) return
    setLoading(true)
    setTextContent(null)
    setEmptyReason(null)
    setFileBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    try {
      const s1 = await getStep1(taskId)
      setStep1(s1)
      const pr = (s1.parse_result ?? {}) as Record<string, unknown>
      const fullText = pr.document_full_text
      if (typeof fullText === 'string' && fullText.trim()) {
        setTextContent(fullText.trim())
        return
      }

      const { artifacts } = await listArtifacts(taskId)
      const uploaded = pickUploadedArtifact(artifacts ?? [])
      if (!uploaded?.path) {
        setEmptyReason('暂无企标正文：请先在向导第 1 步上传企标文件。')
        return
      }

      const displayName = uploaded.label || s1.task.uploaded_file_name || '企标文件'
      const blob = await downloadArtifactFile(taskId, uploaded.path)
      const mime = guessBlobMime(blob, displayName)
      setFileLabel(displayName)
      setFileMime(mime)

      if (mime === 'application/pdf' || mime.startsWith('image/')) {
        const url = URL.createObjectURL(blob)
        setFileBlobUrl(url)
        return
      }

      if (mime.startsWith('text/') || mime === 'application/json') {
        const text = await blob.text()
        setTextContent(text.trim() || '（文件为空）')
        return
      }

      const url = URL.createObjectURL(blob)
      setFileBlobUrl(url)
    } catch (e) {
      message.error(getComplianceApiErrorMessage(e))
      setEmptyReason(getComplianceApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (!Number.isFinite(taskId) || taskId < 1) {
      message.error('缺少任务 id')
      navigate('/compliance')
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 按 taskId 拉取一次正文
  }, [navigate, taskId])

  useEffect(() => {
    return () => {
      if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl)
    }
  }, [fileBlobUrl])

  const onClose = () => {
    if (window.opener) {
      window.close()
      return
    }
    navigate(`/compliance/evaluations/${taskId}`, { replace: false })
  }

  const title = qbCode || step1?.task.uploaded_file_name?.trim() || `任务 #${taskId}`

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onClose}>
          关闭
        </Button>
        <Text type="secondary" ellipsis style={{ flex: 1 }}>
          {title}
        </Text>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <Spin style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
        ) : emptyReason ? (
          <Result status="info" title="暂无正文" subTitle={emptyReason} />
        ) : textContent != null ? (
          <div style={{ height: '100%', overflow: 'auto', padding: '16px 24px' }}>
            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontSize: 14, lineHeight: 1.75 }}>
              {textContent}
            </Paragraph>
          </div>
        ) : fileBlobUrl && fileMime === 'application/pdf' ? (
          <iframe
            title="企标正文"
            src={fileBlobUrl}
            style={{ display: 'block', width: '100%', height: 'calc(100vh - 41px)', border: 'none' }}
          />
        ) : fileBlobUrl && fileMime.startsWith('image/') ? (
          <div style={{ height: '100%', overflow: 'auto', padding: 16, textAlign: 'center' }}>
            <img src={fileBlobUrl} alt={fileLabel} style={{ maxWidth: '100%' }} />
          </div>
        ) : fileBlobUrl ? (
          <div style={{ padding: 24 }}>
            <Result
              status="info"
              title="当前文件格式无法在浏览器内直接预览"
              subTitle={fileLabel}
              extra={
                <Button type="primary" href={fileBlobUrl} download={fileLabel}>
                  下载企标文件
                </Button>
              }
            />
          </div>
        ) : (
          <Result status="warning" title="未能加载企标正文" />
        )}
      </div>
    </div>
  )
}
