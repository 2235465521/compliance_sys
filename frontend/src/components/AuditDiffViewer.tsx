import { Alert, Space, Table, Typography } from 'antd'
import type { AuditLogChange } from '@/types/system'

export interface AuditDiffViewerProps {
  changes: AuditLogChange[]
  /** 操作失败时在顶部展示告警 */
  failed?: boolean
  failureHint?: string
}

export default function AuditDiffViewer({ changes, failed, failureHint }: AuditDiffViewerProps) {
  const hasDiff = changes.length > 0

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {failed ? (
        <Alert
          type="error"
          showIcon
          message="操作未成功"
          description={
            failureHint ??
            (hasDiff ? '以下为请求中的字段变更记录；最终以服务端状态为准。' : '无可展示的字段级 Diff 或快照。')
          }
        />
      ) : null}
      {!hasDiff && !failed ? (
        <Typography.Text type="secondary">本条记录无结构化字段变更（如纯登录、导出类）。</Typography.Text>
      ) : null}
      {hasDiff ? (
        <Table<AuditLogChange>
          size="small"
          pagination={false}
          rowKey={(_, i) => String(i)}
          dataSource={changes}
          columns={[
            { title: '字段', dataIndex: 'field', width: 160, ellipsis: true },
            {
              title: '旧值',
              dataIndex: 'oldValue',
              ellipsis: true,
              render: (t: string) => (t ? <Typography.Text delete>{t}</Typography.Text> : '—'),
            },
            {
              title: '新值',
              dataIndex: 'newValue',
              ellipsis: true,
              render: (t: string) =>
                t ? <Typography.Text mark>{t}</Typography.Text> : '—',
            },
          ]}
          onRow={(record) => ({
            style:
              record.oldValue !== record.newValue
                ? { background: 'var(--ant-color-warning-bg, #fffbe6)' }
                : undefined,
          })}
        />
      ) : null}
    </Space>
  )
}
