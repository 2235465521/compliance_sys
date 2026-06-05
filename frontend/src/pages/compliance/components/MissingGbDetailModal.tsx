import React from 'react'
import { Alert, Button, Descriptions, Modal, Space, Typography, Upload } from 'antd'
import { CloudUploadOutlined } from '@ant-design/icons'
import { formatStdMissingReason, type StdOrchestrationDisplay } from '@/pages/compliance/utils/step5StdOrchestrationLookup'

const { Text } = Typography

export type MissingGbDetailModalProps = {
  open: boolean
  info: StdOrchestrationDisplay | null
  uploading: boolean
  onClose: () => void
  onUpload: (file: File) => void
}

export function MissingGbDetailModal(props: MissingGbDetailModalProps) {
  const { open, info, uploading, onClose, onUpload } = props

  return (
    <Modal
      title="国标指标未就绪"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose} disabled={uploading}>
          关闭
        </Button>,
      ]}
      width={520}
      destroyOnClose
    >
      {info ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="标准号">{info.stdCode}</Descriptions.Item>
            <Descriptions.Item label="标准名称">
              {info.stdName?.trim() || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="库内指标条数">
              {info.indicatorCount > 0 ? `${info.indicatorCount} 条` : '暂无'}
            </Descriptions.Item>
            <Descriptions.Item label="缺失原因">
              {formatStdMissingReason(info.reason)}
            </Descriptions.Item>
          </Descriptions>
          <Alert
            type="info"
            showIcon
            message="上传成功后将关闭本窗口，列表中该标准会显示「正在解析」，解析完成后自动变为「有指标」。"
          />
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              上传国标 PDF/文件，更新库内路径并触发工作流②解析入库。
            </Text>
            <Upload
              showUploadList={false}
              disabled={uploading}
              beforeUpload={(file) => {
                onUpload(file)
                return false
              }}
            >
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                loading={uploading}
                block
              >
                上传国标并开始解析
              </Button>
            </Upload>
          </div>
        </Space>
      ) : null}
    </Modal>
  )
}
