import React, { useRef } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useNavigate } from 'react-router-dom'
import ComplianceWizardPanel, { type ComplianceWizardPanelHandle } from '@/pages/compliance/ComplianceWizardPanel'

const ComplianceWizardPage: React.FC = () => {
  const navigate = useNavigate()
  const panelRef = useRef<ComplianceWizardPanelHandle>(null)

  return (
    <PageContainer
      header={{
        title: '合规性评价完整流程向导',
        subTitle: '独立入口：与主工作台共用同一套 7 步向导',
      }}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compliance')}>
          返回工作台
        </Button>,
        <Button key="top" type="primary" onClick={() => panelRef.current?.scrollIntoView()}>
          定位到向导
        </Button>,
      ]}
    >
      <ComplianceWizardPanel ref={panelRef} />
    </PageContainer>
  )
}

export default ComplianceWizardPage
