import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Typography,
  message,
} from 'antd'
import type { DuplicateCheckPayload } from '@/types/duplicate-check'
import { useDuplicateCheckStore } from '@/stores/duplicate-check'

type FormValues = DuplicateCheckPayload

const QUERY_MAX_LEN = 4000

export function DuplicateCheckForm() {
  const [form] = Form.useForm<FormValues>()
  const runCheck = useDuplicateCheckStore((s) => s.runCheck)
  const submitting = useDuplicateCheckStore((s) => s.submitting)
  const clear = useDuplicateCheckStore((s) => s.clear)
  const queryValue = Form.useWatch('queryText', form) as string | undefined
  const queryLen = typeof queryValue === 'string' ? queryValue.length : 0

  async function onFinish(values: FormValues) {
    const payload: DuplicateCheckPayload = {
      queryText: values.queryText.trim(),
    }
    const source = await runCheck(payload)
    if (source === 'mock') {
      message.warning('已展示示例数据（请求失败原因见上方红色提示）。')
    } else {
      message.success('查重完成')
    }
  }

  return (
    <Card className="dupcheck-card">
      <Typography.Title
        level={5}
        className="dupcheck-section-title dupcheck-section-title--highlight"
        style={{ marginTop: 0 }}
      >
        查重服务
      </Typography.Title>

      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Form.Item
          label="检索内容"
          name="queryText"
          className="dupcheck-form-item dupcheck-form-item--span2"
          rules={[
            {
              validator: async (_, value) => {
                if (typeof value === 'string' && value.trim().length > 0) return
                throw new Error('请输入拟建标准名称、关键词、大纲或立项说明')
              },
            },
          ]}
        >
          <div className="dupcheck-textarea-wrap">
            <Input.TextArea
              rows={6}
              placeholder="可填写拟建标准名称、标准号片段、关键词，或粘贴大纲 / 适用范围 / 立项说明等；后台将按名称快查与语义分析能力统一处理。"
              maxLength={QUERY_MAX_LEN}
              showCount={false}
            />
            <div className="dupcheck-textarea-count">
              {queryLen}/{QUERY_MAX_LEN}
            </div>
          </div>
        </Form.Item>

        <Divider style={{ margin: '12px 0 16px' }} />

        <div className="dupcheck-actions-row" style={{ justifyContent: 'flex-end' }}>
          <div className="dupcheck-actions">
            <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
              开始查重
            </Button>
            <Button
              onClick={() => {
                form.resetFields()
                clear()
              }}
              disabled={submitting}
            >
              重置
            </Button>
          </div>
        </div>
      </Form>
    </Card>
  )
}
