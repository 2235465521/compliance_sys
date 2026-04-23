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

type FormValues = Omit<DuplicateCheckPayload, 'keywords'> & {
  /** 表单输入为字符串，提交时规范化为 string[] */
  keywords?: string | string[]
}

export function DuplicateCheckForm() {
  const [form] = Form.useForm<FormValues>()
  const runCheck = useDuplicateCheckStore((s) => s.runCheck)
  const submitting = useDuplicateCheckStore((s) => s.submitting)
  const clear = useDuplicateCheckStore((s) => s.clear)
  const outlineValue = Form.useWatch('outline', form) as string | undefined
  const outlineLen = typeof outlineValue === 'string' ? outlineValue.length : 0

  async function onFinish(values: FormValues) {
    const kw = values.keywords
    const keywords = Array.isArray(kw)
      ? kw
      : typeof kw === 'string'
        ? kw
            .split(/[\s、,，;；]+/g)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : undefined
    const payload: DuplicateCheckPayload = {
      standardName: values.standardName,
      outline: values.outline,
      keywords,
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
        <div className="dupcheck-form-grid dupcheck-form-grid--46">
          <Form.Item
            label="拟建标准名称"
            name="standardName"
            rules={[{ required: true, message: '请输入标准名称' }]}
            className="dupcheck-form-item"
          >
            <Input placeholder="例如：XX 产品质量评价规范" allowClear maxLength={80} />
          </Form.Item>

          <Form.Item label="核心关键词（可选）" name="keywords" className="dupcheck-form-item">
            <Input
              placeholder="用空格、顿号或逗号分隔"
              allowClear
              onBlur={(e) => {
                const raw = e.target.value || ''
                const list = raw
                  .split(/[\s、,，;；]+/g)
                  .map((s) => s.trim())
                  .filter(Boolean)
                if (!list.length) return
                form.setFieldValue('keywords', list)
              }}
            />
          </Form.Item>

          <Form.Item
            label="搜索范围 / 大纲（可选）"
            name="outline"
            className="dupcheck-form-item dupcheck-form-item--span2"
          >
            <div className="dupcheck-textarea-wrap">
              <Input.TextArea
                rows={4}
                placeholder="可粘贴章节大纲、适用范围或关键条款摘要"
                maxLength={2000}
                showCount={false}
              />
              <div className="dupcheck-textarea-count">{outlineLen}/2000</div>
            </div>
          </Form.Item>
        </div>

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
