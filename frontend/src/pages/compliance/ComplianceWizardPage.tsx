import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Space, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import ComplianceWizardPanel from '@/pages/compliance/ComplianceWizardPanel'
import { setComplianceEvaluationTaskId } from '@/services/compliance'

const { Text } = Typography

export default function ComplianceWizardPage() {
  const { taskId: taskIdParam } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const taskId = Number(taskIdParam)

  useEffect(() => {
    if (!Number.isFinite(taskId) || taskId < 1) {
      message.error('无效的任务 id')
      navigate('/compliance', { replace: true })
      return
    }
    setComplianceEvaluationTaskId(taskId)
  }, [navigate, taskId])

  if (!Number.isFinite(taskId) || taskId < 1) {
    return null
  }

  return (
    <PageContainer
      header={{
        title: '合规性评价向导',
        subTitle: `任务 #${taskId}`,
        extra: (
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/compliance')}>
            返回任务中心
          </Button>
        ),
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 12 }}>
        <Text type="secondary">
          步骤进度以服务端 confirm 为准；回退已解锁步骤时会自动从服务端恢复数据（含技术指标对比快照）。
        </Text>
      </Space>
      <ComplianceWizardPanel taskId={taskId} />
    </PageContainer>
  )
}
