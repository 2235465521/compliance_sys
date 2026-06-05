import React from 'react'
import { Button, Flex, Input, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  createEmptyContentPair,
  pairsEditToPlainText,
  plainTextToPairsEdit,
  type IndexContentEdit,
  type IndexContentPair,
} from '@/pages/compliance/utils/parseNationalIndicatorValue'
import './NationalIndicatorIndexContent.css'

const { Text } = Typography

export function IndexContentReadView({ content }: { content: IndexContentEdit }) {
  if (content.mode === 'plain') {
    const t = content.text.trim()
    return (
      <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{t || '—'}</Text>
    )
  }
  const visible = content.pairs.filter((p) => p.key.trim() || p.value.trim())
  if (visible.length === 0) {
    return <Text type="secondary">—</Text>
  }
  return (
    <div className="nat-index-content-read">
      {visible.map((p) => (
        <div key={p.id} className="nat-index-content-read-line">
          <Text className="nat-index-content-read-key">{p.key.trim() || '—'}</Text>
          <Text className="nat-index-content-read-sep">：</Text>
          <Text className="nat-index-content-read-val">{p.value.trim() || '—'}</Text>
        </div>
      ))}
    </div>
  )
}

type IndexContentEditorProps = {
  value: IndexContentEdit
  onChange: (next: IndexContentEdit) => void
}

export function IndexContentEditor({ value, onChange }: IndexContentEditorProps) {
  if (value.mode === 'plain') {
    return (
      <div className="nat-index-content-editor">
        <Input.TextArea
          size="small"
          autoSize={{ minRows: 2, maxRows: 6 }}
          value={value.text}
          placeholder="整段描述，如：应符合 GB 2762 的规定"
          onChange={(e) => onChange({ mode: 'plain', text: e.target.value })}
        />
        <Button
          type="link"
          size="small"
          className="nat-index-content-editor-switch"
          onClick={() => onChange(plainTextToPairsEdit(value.text))}
        >
          拆分为「项目 + 要求」
        </Button>
      </div>
    )
  }

  const updatePair = (id: string, patch: Partial<IndexContentPair>) => {
    onChange({
      mode: 'pairs',
      pairs: value.pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const addPair = () => {
    onChange({ mode: 'pairs', pairs: [...value.pairs, createEmptyContentPair()] })
  }

  const removePair = (id: string) => {
    const next = value.pairs.filter((p) => p.id !== id)
    onChange({
      mode: 'pairs',
      pairs: next.length > 0 ? next : [createEmptyContentPair()],
    })
  }

  return (
    <div className="nat-index-content-editor">
      <div className="nat-index-content-pairs-head">
        <Text type="secondary" className="nat-index-content-pairs-label">
          项目
        </Text>
        <Text type="secondary" className="nat-index-content-pairs-label">
          要求 / 限值
        </Text>
        <span className="nat-index-content-pairs-action" />
      </div>
      {value.pairs.map((pair) => (
        <Flex key={pair.id} gap={6} align="start" className="nat-index-content-pair-row">
          <Input
            size="small"
            className="nat-index-content-pair-key"
            value={pair.key}
            placeholder="如：酸价"
            onChange={(e) => updatePair(pair.id, { key: e.target.value })}
          />
          <Input
            size="small"
            className="nat-index-content-pair-val"
            value={pair.value}
            placeholder="如：≤2.5"
            onChange={(e) => updatePair(pair.id, { value: e.target.value })}
          />
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            aria-label="删除该项"
            onClick={() => removePair(pair.id)}
          />
        </Flex>
      ))}
      <Flex gap={8} wrap="wrap" className="nat-index-content-editor-actions">
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addPair}>
          添加项
        </Button>
        <Button
          type="link"
          size="small"
          onClick={() => onChange({ mode: 'plain', text: pairsEditToPlainText(value) })}
        >
          改为整段描述
        </Button>
      </Flex>
    </div>
  )
}
