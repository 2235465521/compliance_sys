import {
  Button,
  Space,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { CloudUploadOutlined, LoadingOutlined } from '@ant-design/icons'
import { SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'
import { useState } from 'react'
import { submitBatchIndexImport } from '@/services/standard-library'
import type { IndexImportJob } from '@/services/standard-library'
import IndexImportJobList from './IndexImportJobList'
import IndicatorListTab from './IndicatorListTab'

const { Title, Text } = Typography

const C = {
  workspaceBg:            '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer:       '#dbf1fe',
  primary:                '#002854',
  onSurfaceVariant:       '#43474f',
  outlineVariant:         'rgba(195, 198, 208, 0.45)',
}

export default function StandardLibraryIndexIngestPage() {
  const [fileList, setFileList]         = useState<UploadFile[]>([])
  const [submitting, setSubmitting]     = useState(false)
  const [listRefreshKey, setListRefreshKey] = useState(0)
  /** 提交成功后的 job id，传给列表组件自动打开详情 */
  const [newJobId, setNewJobId]         = useState<string | number | null>(null)

  const handleSubmit = async () => {
    const files = fileList.map((f) => f.originFileObj).filter(Boolean) as File[]
    if (files.length === 0) {
      message.warning('请先选择至少一个国标文件')
      return
    }
    setSubmitting(true)
    try {
      const res: IndexImportJob = await submitBatchIndexImport(files)
      const id = res.id
      if (!id) throw new Error(`POST 响应缺少有效的 job id：${JSON.stringify(res)}`)
      setFileList([])
      setNewJobId(id)
      setListRefreshKey((k) => k + 1)
      message.success(`批次 #${id} 已提交，共 ${res.total_items ?? files.length} 个文件`)
    } catch (e) {
      message.error((e as Error).message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        background: C.workspaceBg,
        margin: -24,
        padding: '28px 32px 40px',
        minHeight: 'calc(100vh - 48px)',
      }}
    >
      {/* 页头 */}
      <div
        style={{
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: `1px solid ${C.outlineVariant}`,
        }}
      >
        <Title level={2} style={SL_PAGE_TITLE}>国标指标入库</Title>
      </div>

      <Tabs
        defaultActiveKey="ingest"
        size="large"
        style={{ marginTop: -8 }}
        items={[
          {
            key: 'ingest',
            label: '批量入库',
            children: (
              <Space direction="vertical" size={28} style={{ width: '100%' }}>

                {/* 上传区 */}
                <section>
                  <Upload.Dragger
                    multiple
                    accept=".pdf,.doc,.docx"
                    showUploadList={{ showRemoveIcon: true }}
                    fileList={fileList}
                    beforeUpload={(file) => {
                      setFileList((prev) => [
                        ...prev,
                        { uid: file.uid, name: file.name, originFileObj: file },
                      ])
                      return false
                    }}
                    onRemove={(file) =>
                      setFileList((prev) => prev.filter((f) => f.uid !== file.uid))
                    }
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
                      <Title
                        level={4}
                        style={{ margin: '0 0 8px', color: C.primary, textAlign: 'center' }}
                      >
                        点击或拖拽国标文件到此处
                      </Title>
                      <Text
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          color: C.onSurfaceVariant,
                          fontSize: 13,
                        }}
                      >
                        支持 PDF、DOCX；可同时选择多个文件
                      </Text>
                    </div>
                  </Upload.Dragger>

                  <Space wrap style={{ marginTop: 16 }}>
                    <Button
                      type="primary"
                      icon={submitting ? <LoadingOutlined /> : <CloudUploadOutlined />}
                      loading={submitting}
                      disabled={fileList.length === 0}
                      onClick={() => void handleSubmit()}
                    >
                      提交批量入库（{fileList.length} 个文件）
                    </Button>
                    {fileList.length > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        已选 {fileList.length} 个文件
                      </Text>
                    )}
                  </Space>
                </section>

                {/* 批次列表（含「进入/删除」操作，进入打开详情抽屉） */}
                <IndexImportJobList
                  refreshKey={listRefreshKey}
                  autoOpenJobId={newJobId}
                  onAutoOpenDone={() => setNewJobId(null)}
                />

              </Space>
            ),
          },
          {
            key: 'indicators',
            label: '指标列表',
            children: <IndicatorListTab />,
          },
        ]}
      />
    </div>
  )
}
