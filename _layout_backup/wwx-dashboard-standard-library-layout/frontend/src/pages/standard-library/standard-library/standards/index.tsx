import { ProTable } from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import zhCN from 'antd/locale/zh_CN'
import { SL_PAGE_TITLE } from '@/pages/standard-library/pageHeaderStyles'

/** 分页区文案（与全局 zhCN 一致并显式写出，避免 ProTable 内层未吃到 ConfigProvider） */
const paginationLocaleZh = {
  ...zhCN.Pagination,
  items_per_page: '条/页',
  jump_to: '跳至',
  jump_to_confirm: '确定',
  page: '页',
  prev_page: '上一页',
  next_page: '下一页',
  prev_5: '向前 5 页',
  next_5: '向后 5 页',
  prev_3: '向前 3 页',
  next_3: '向后 3 页',
  page_size: '每页条数',
}
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  deleteDetailInfo,
  fetchDetailInfo,
  downloadMetadataImportTemplate,
  importStandardMetadataBatch,
  listStandards,
  patchDetailInfo,
} from '@/services/standard-library'
import type { StdBaseRow } from '@/types/standard-library'

const { Title, Text, Link } = Typography

/** 正文预览 / 下载：`/api/v1/standards/detail-text/{preview|download}/?bz_id=`（bz_id 已 URL 编码） */
function standardsDetailTextUrl(kind: 'preview' | 'download', bzId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
  return `${base}/v1/standards/detail-text/${kind}/?bz_id=${encodeURIComponent(bzId)}`
}

/** 标准详情：主表 14 列（与入库表头一致）；其下为 `national_standard_extension` 拓展字段 */
const STD_DETAIL_SCHEMA: { key: string; label: string }[] = [
  { key: 'std_code', label: '国标号' },
  { key: 'std_name', label: '标准名称' },
  { key: 'std_status', label: '标准状态' },
  { key: 'ex_state', label: '执行状态' },
  { key: 'publish_date', label: '发布日期' },
  { key: 'effective_date', label: '实施日期' },
  { key: 'abolition_date', label: '废止日期' },
  { key: 'std_category', label: '标准类别' },
  { key: 'replaces_std_code', label: '代替标准' },
  { key: 'replace_type', label: '代替类型' },
  { key: 'ccs_code', label: '中国标准分类号' },
  { key: 'ics_code', label: '国际标准分类号' },
  { key: 'ped_id', label: '谱系号' },
  { key: 'detail_url', label: '详情链接' },
  { key: 'std_file_path', label: '国标文件保存路径' },
  /** national_standard_extension */
  { key: 'responsible_unit', label: '归口单位/部门' },
  { key: 'secondary_responsible_unit', label: '副归口单位' },
  { key: 'issuing_department', label: '颁发部门' },
  { key: 'executing_unit', label: '执行单位' },
  { key: 'technical_committee', label: '技术委员会' },
  { key: 'governing_department', label: '主管部门' },
  { key: 'adoption_status', label: '采标情况' },
  { key: 'drafting_unit', label: '起草单位' },
  { key: 'drafter', label: '起草人' },
]

const MAIN_DETAIL_PATCH_CAMEL: Record<string, string> = {
  std_name: 'stdName',
  std_status: 'stdStatus',
  ex_state: 'exState',
  publish_date: 'publishDate',
  effective_date: 'effectiveDate',
  abolition_date: 'abolitionDate',
  std_category: 'stdCategory',
  replaces_std_code: 'replacesStdCode',
  replace_type: 'replaceType',
  ccs_code: 'ccsCode',
  ics_code: 'icsCode',
  ped_id: 'pedId',
  detail_url: 'detailUrl',
  std_file_path: 'stdFilePath',
}

const EXTENSION_DETAIL_PATCH_CAMEL: Record<string, string> = {
  responsible_unit: 'responsibleUnit',
  secondary_responsible_unit: 'secondaryResponsibleUnit',
  issuing_department: 'issuingDepartment',
  executing_unit: 'executingUnit',
  technical_committee: 'technicalCommittee',
  governing_department: 'governingDepartment',
  adoption_status: 'adoptionStatus',
  drafting_unit: 'draftingUnit',
  drafter: 'drafter',
}

const STD_DETAIL_FORM_KEYS = STD_DETAIL_SCHEMA.map((r) => r.key)

function isEmptyDetailValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return !v.trim()
  return false
}

function parseEmbeddedObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

/** 国标拓展：`national_standard_extension`；兼容详情里嵌在 `extension` 的 JSON（历史结构） */
function getNationalStandardExtensionRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  return (
    parseEmbeddedObject(record.national_standard_extension) ??
    parseEmbeddedObject(record.extension) ??
    parseEmbeddedObject(record.std_extension)
  )
}

/** 取值：主表顶层 → 拓展嵌套对象 → 主表别名（国标号/名称/状态） */
function resolveStdDetailField(record: Record<string, unknown>, key: string): unknown {
  const ext = getNationalStandardExtensionRecord(record)

  const top = record[key]
  if (!isEmptyDetailValue(top)) return top

  const nested = ext?.[key]
  if (!isEmptyDetailValue(nested)) return nested

  switch (key) {
    case 'std_code':
      return record.stdCode ?? record.bzId ?? record.bz_id
    case 'std_name':
      return record.bzName ?? record.stdName ?? record.bz_name
    case 'std_status':
      return record.stdStatus ?? record.ex_state
    case 'std_category':
      return record.stdCategory ?? record.std_category
    case 'publish_date':
      return record.publishDate ?? record.publish_date ?? record.bzReleaseDate ?? record.bz_release_date
    case 'effective_date':
      return record.effectiveDate ?? record.effective_date ?? record.implementTime ?? record.implement_time
    case 'ex_state':
      return record.ex_state ?? record.exState ?? record.std_status ?? record.stdStatus
    default:
      return top
  }
}

function detailFieldToFormString(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

function buildStdDetailFormValues(rec: Record<string, unknown>): Record<string, string> {
  const vals: Record<string, string> = {}
  for (const key of STD_DETAIL_FORM_KEYS) {
    vals[key] = detailFieldToFormString(resolveStdDetailField(rec, key))
  }
  return vals
}

function buildIncrementalDetailPatch(cur: Record<string, string>, prev: Record<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const trim = (s: string) => s.trim()

  for (const key of STD_DETAIL_FORM_KEYS) {
    if (key === 'std_code') continue
    const camelMain = MAIN_DETAIL_PATCH_CAMEL[key]
    const camelExt = EXTENSION_DETAIL_PATCH_CAMEL[key]
    const now = trim(cur[key] ?? '')
    const was = trim(prev[key] ?? '')
    if (now === was) continue
    if (camelMain) {
      patch[camelMain] = now
      continue
    }
    if (camelExt) {
      const ext = (patch.extension as Record<string, unknown> | undefined) ?? {}
      patch.extension = ext
      ext[camelExt] = now
    }
  }

  return patch
}

function formatStdDetailValue(v: unknown): ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  const s = String(v)
  return s.trim() === '' ? '—' : s
}


function renderExStateTag(state: string | undefined) {
  if (!state) return <Tag>—</Tag>
  if (state === '现行') return <Tag color="success">现行</Tag>
  if (state === '废止') return <Tag color="error">废止</Tag>
  if (state === '即将实施') return <Tag color="warning">即将实施</Tag>
  return <Tag>{state}</Tag>
}

/** 列表标准号：接口以 camelCase 为主（stdCode / bzId），仅少量旧数据回退 bz_id */
function listRowStdCode(row: StdBaseRow): string | undefined {
  const v = row.stdCode ?? row.bzId ?? row.bz_id
  if (v != null && String(v).trim()) return String(v).trim()
  return undefined
}

function listRowStdName(row: StdBaseRow): string | undefined {
  const v = row.bzName ?? row.stdName ?? row.bz_name
  if (v != null && String(v).trim()) return String(v).trim()
  return undefined
}

/** 执行状态：stdStatus（camelCase）为主 */
function listRowExState(row: StdBaseRow): string | undefined {
  const v = row.stdStatus ?? row.ex_state
  if (v != null && String(v).trim()) return String(v).trim()
  return undefined
}

/** 标准类别：stdCategory（列表接口 camelCase） */
function listStdCategoryCell(row: StdBaseRow): string {
  const v = row.stdCategory ?? row.std_category
  if (v != null && String(v).trim()) return String(v).trim()
  return '—'
}

/** 发布日期：bzReleaseDate / publishDate（camelCase） */
function listBzReleaseDateCell(row: StdBaseRow): string {
  const v = row.bzReleaseDate ?? row.publishDate ?? row.publish_date ?? row.bz_release_date ?? row.release_date
  if (v != null && String(v).trim()) return String(v).trim()
  return ''
}

/** 实施日期：implementTime / effectiveDate（camelCase） */
function listImplementDateCell(row: StdBaseRow): string {
  const v = row.implementTime ?? row.effectiveDate ?? row.implement_time ?? row.effective_date
  if (v != null && String(v).trim()) return String(v).trim()
  return ''
}

/** 批量入库：HTTP 400 时 `detail` 可能为多行摘要，短文用 Message、长文用 Modal 完整展示 */
function showBatchImportFailureMessage(text: string) {
  const t = text.trim() || '批量入库失败'
  if (t.length > 280) {
    Modal.error({
      title: '批量入库未通过',
      width: 680,
      okText: '知道了',
      content: (
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 420,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {t}
        </pre>
      ),
    })
  } else {
    message.error(t)
  }
}

export default function StandardLibraryRegistryPage() {
  const actionRef = useRef<ActionType>(null)
  /** 避免 setState 与 reload 同帧时 request 读到旧的 keyword / ex_state */
  const listQueryRef = useRef<{ keyword: string; exState: string | undefined }>({ keyword: '', exState: undefined })

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailBzId, setDetailBzId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [listExState, setListExState] = useState<string | undefined>(undefined)

  const [batchFileList, setBatchFileList] = useState<UploadFile[]>([])
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [csvTemplateDownloading, setCsvTemplateDownloading] = useState(false)


  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailDeleting, setDetailDeleting] = useState(false)
  const [detailForm] = Form.useForm<Record<string, string>>()
  const detailEditBaselineRef = useRef<Record<string, string> | null>(null)

  const openDetail = useCallback(async (bzId: string) => {
    setDetailEditMode(false)
    detailEditBaselineRef.current = null
    detailForm.resetFields()
    setDetailBzId(bzId)
    setDrawerOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await fetchDetailInfo(bzId)
      setDetail(d)
    } catch (e) {
      message.error((e as Error).message)
      setDrawerOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [detailForm])

  const startDetailEdit = useCallback(() => {
    if (!detail) return
    const init = buildStdDetailFormValues(detail)
    detailEditBaselineRef.current = init
    detailForm.setFieldsValue(init)
    setDetailEditMode(true)
  }, [detail, detailForm])

  const cancelDetailEdit = useCallback(() => {
    setDetailEditMode(false)
    detailForm.resetFields()
    detailEditBaselineRef.current = null
  }, [detailForm])

  const submitDetailEdit = useCallback(async () => {
    if (!detailBzId || !detailEditBaselineRef.current) return
    let cur: Record<string, string>
    try {
      cur = await detailForm.validateFields()
    } catch {
      return
    }
    const patch = buildIncrementalDetailPatch(cur, detailEditBaselineRef.current)
    if (Object.keys(patch).length === 0) {
      message.info('没有修改')
      return
    }
    setDetailSaving(true)
    try {
      await patchDetailInfo(detailBzId, patch)
      message.success('已保存')
      const d = await fetchDetailInfo(detailBzId)
      setDetail(d)
      cancelDetailEdit()
      actionRef.current?.reload()
    } catch (e) {
      message.error((e as Error).message || '保存失败')
    } finally {
      setDetailSaving(false)
    }
  }, [detailBzId, detailForm, cancelDetailEdit])

  const confirmDeleteDetail = useCallback(() => {
    if (!detailBzId) return
    Modal.confirm({
      title: '确认删除该标准？',
      content:
        '将从主表、扩展表及谱系表中删除该国标号对应的记录（谱系关系边不删除）。此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDetailDeleting(true)
        try {
          await deleteDetailInfo(detailBzId)
          message.success('已删除')
          setDrawerOpen(false)
          setDetail(null)
          setDetailBzId(null)
          setDetailEditMode(false)
          detailEditBaselineRef.current = null
          detailForm.resetFields()
          actionRef.current?.reload()
        } catch (e) {
          message.error((e as Error).message || '删除失败')
          throw e
        } finally {
          setDetailDeleting(false)
        }
      },
    })
  }, [detailBzId, detailForm])

  const uploadProps: UploadProps = {
    multiple: true,
    accept: '.xlsx,.xls,.csv',
    fileList: batchFileList,
    beforeUpload: (file) => {
      setBatchFileList((prev) => [...prev, { uid: file.uid, name: file.name, originFileObj: file }])
      return false
    },
    onRemove: (file) => {
      setBatchFileList((prev) => prev.filter((f) => f.uid !== file.uid))
    },
  }

  const submitBatchImport = async () => {
    const files = batchFileList.map((f) => f.originFileObj).filter(Boolean) as File[]
    if (files.length === 0) {
      message.warning('请先选择要入库的文件')
      return
    }
    setBatchSubmitting(true)
    try {
      await importStandardMetadataBatch(files)
      message.success('批量入库已全部成功')
      setBatchFileList([])
      setBatchModalOpen(false)
      void loadStats()
      actionRef.current?.reload()
    } catch (e) {
      const msg =
        e instanceof Error && typeof e.message === 'string' && e.message.trim()
          ? e.message.trim()
          : '批量入库失败'
      showBatchImportFailureMessage(msg)
    } finally {
      setBatchSubmitting(false)
    }
  }

  const downloadCsvTemplate = async () => {
    setCsvTemplateDownloading(true)
    try {
      await downloadMetadataImportTemplate('csv')
      message.success('已开始下载 CSV 模板')
    } catch (e) {
      message.error((e as Error).message || '下载模板失败')
    } finally {
      setCsvTemplateDownloading(false)
    }
  }


  const columns: ProColumns<StdBaseRow>[] = [
    {
      title: '标准号',
      dataIndex: 'stdCode',
      copyable: true,
      ellipsis: true,
      width: 200,
      render: (_, row) => listRowStdCode(row) ?? '—',
    },
    {
      title: '名称',
      dataIndex: 'bzName',
      ellipsis: true,
      render: (_, row) => listRowStdName(row) ?? '—',
    },
    {
      title: '类别',
      dataIndex: 'stdCategory',
      width: 120,
      ellipsis: true,
      search: false,
      render: (_, row) => (
        <Text ellipsis={{ tooltip: listStdCategoryCell(row) }}>{listStdCategoryCell(row)}</Text>
      ),
    },
    {
      title: '执行状态',
      dataIndex: 'stdStatus',
      width: 110,
      search: false,
      render: (_, row) => renderExStateTag(listRowExState(row)),
    },
    {
      title: '发布日期',
      dataIndex: 'bzReleaseDate',
      width: 120,
      search: false,
      render: (_, row) => listBzReleaseDateCell(row) || '—',
    },
    {
      title: '实施日期',
      dataIndex: 'implementTime',
      width: 120,
      search: false,
      render: (_, row) => listImplementDateCell(row) || '—',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 88,
      fixed: 'right',
      render: (_, record) => {
        const code = listRowStdCode(record)
        return (
          <Button type="link" size="small" disabled={!code} onClick={() => code && openDetail(code)}>
            详情
          </Button>
        )
      },
    },
  ]

  return (
    <div style={{ width: '100%' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={SL_PAGE_TITLE}>
            标准入库与查询
          </Title>
        </div>


        <Card
          bordered={false}
          style={{
            borderRadius: 12,
            boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)',
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(5,5,5,0.06)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space wrap>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setBatchModalOpen(true)}>
                批量入库
              </Button>
            </Space>
            <Space wrap style={{ justifyContent: 'flex-end' }}>
              <Select
                allowClear
                placeholder="执行状态"
                style={{ width: 140 }}
                value={listExState}
                onChange={(v) => {
                  listQueryRef.current.exState = v
                  setListExState(v)
                  actionRef.current?.reload()
                }}
                options={[
                  { label: '现行', value: '现行' },
                  { label: '废止', value: '废止' },
                  { label: '即将实施', value: '即将实施' },
                ]}
              />
              <Input.Search
                allowClear
                placeholder="搜索标准号、名称…"
                style={{ width: 320, maxWidth: '100%' }}
                value={searchInput}
                onChange={(e) => {
                  const v = e.target.value
                  setSearchInput(v)
                  if (!v) {
                    listQueryRef.current.keyword = ''
                    actionRef.current?.reload()
                  }
                }}
                onSearch={(v) => {
                  const t = v.trim()
                  listQueryRef.current.keyword = t
                  setSearchInput(v)
                  actionRef.current?.reload()
                }}
              />
            </Space>
          </div>

          <ProTable<StdBaseRow>
            actionRef={actionRef}
            rowKey={(r, i) => String(r.id ?? listRowStdCode(r) ?? i)}
            columns={columns}
            search={false}
            options={{
              reload: true,
              /** ProTable 密度按钮依赖的 rc-* 在 React 18 StrictMode 下会触发 findDOMNode 弃用警告 */
              density: false,
              setting: true,
            }}
            pagination={{
              locale: paginationLocaleZh,
              defaultPageSize: 20,
              pageSizeOptions: [10, 20, 50, 100],
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `显示第 ${range[0]}–${range[1]} 条，共 ${total} 条记录`,
            }}
            dateFormatter="string"
            cardProps={{ bodyStyle: { padding: '0 20px 20px' } }}
            request={async (params) => {
              try {
                const res = await listStandards({
                  page: params.current,
                  pageSize: params.pageSize,
                  search: listQueryRef.current.keyword || undefined,
                  ex_state: listQueryRef.current.exState,
                })
                return {
                  data: res.results,
                  total: res.count,
                  success: true,
                }
              } catch (e) {
                message.error((e as Error).message || '加载失败')
                return { data: [], total: 0, success: false }
              }
            }}
          />
        </Card>
      </Space>

      <Modal
        title="批量入库"
        open={batchModalOpen}
        onCancel={() => setBatchModalOpen(false)}
        width={560}
        footer={[
          <Button key="c" onClick={() => setBatchModalOpen(false)}>
            取消
          </Button>,
          <Button key="s" type="primary" loading={batchSubmitting} onClick={() => void submitBatchImport()}>
            提交批量入库
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Flex wrap="wrap" gap="small" align="center">
            <Text type="secondary" style={{ marginRight: 4 }}>
              导入模板：
            </Text>
            <Button
              icon={<DownloadOutlined />}
              loading={csvTemplateDownloading}
              onClick={() => void downloadCsvTemplate()}
            >
              下载 CSV 模板
            </Button>
          </Flex>
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined style={{ fontSize: 40, color: '#1677ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处（可多选）</p>
            <p className="ant-upload-hint">选择完成后点击「提交批量入库」。</p>
          </Upload.Dragger>
        </Space>
      </Modal>


      <Drawer
        title={detailBzId ? `标准详情 · ${detailBzId}` : '标准详情'}
        width={560}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setDetailEditMode(false)
          detailEditBaselineRef.current = null
          detailForm.resetFields()
        }}
        destroyOnClose
        extra={
          !detailLoading && detail && detailBzId ? (
            <Space wrap>
              {!detailEditMode ? (
                <>
                  <Button icon={<EditOutlined />} onClick={startDetailEdit}>
                    编辑
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={detailDeleting}
                    onClick={() => void confirmDeleteDetail()}
                  >
                    删除
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={cancelDetailEdit}>取消</Button>
                  <Button type="primary" loading={detailSaving} onClick={() => void submitDetailEdit()}>
                    保存
                  </Button>
                </>
              )}
            </Space>
          ) : null
        }
      >
        {detailLoading ? (
          <span style={{ color: 'rgba(0,0,0,0.45)' }}>加载中…</span>
        ) : detail && detailBzId ? (
          <>
            <Space wrap style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                disabled={detailEditMode}
                onClick={() =>
                  window.open(
                    standardsDetailTextUrl('preview', detailBzId),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                在线预览
              </Button>
              <Link
                href={standardsDetailTextUrl('download', detailBzId)}
                download
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={detailEditMode}
                style={detailEditMode ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
              >
                <DownloadOutlined /> 下载文本
              </Link>
            </Space>
            {detailEditMode ? (
              <Form form={detailForm} layout="vertical" preserve={false} autoComplete="off">
                {STD_DETAIL_SCHEMA.map(({ key, label }) => (
                  <Form.Item key={key} name={key} label={label}>
                    <Input allowClear placeholder={label} disabled={key === 'std_code'} />
                  </Form.Item>
                ))}
              </Form>
            ) : (
              <Descriptions column={1} bordered size="small">
                {STD_DETAIL_SCHEMA.map(({ key, label }) => (
                  <Descriptions.Item key={key} label={label}>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {formatStdDetailValue(resolveStdDetailField(detail, key))}
                    </span>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
          </>
        ) : null}
      </Drawer>
    </div>
  )
}
