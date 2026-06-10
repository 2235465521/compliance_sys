import { useCallback, useRef, useState } from 'react'
import {
  App,
  Button,
  Divider,
  Empty,
  Input,
  Spin,
  Typography,
  Upload,
} from 'antd'
import { FileTextOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { WarningCompareTable } from '@/pages/alert/components/WarningCompareTable'
import { WarningTaskConclusionBanner } from '@/pages/alert/components/WarningTaskConclusionBanner'
import {
  formatFileSize,
  ForwardSearchEmptyGraphic,
  getFileExtensionUpper,
} from '@/pages/alert/components/alertGraphics'
import { useDifyWebSocket } from '@/pages/alert/hooks/useDifyWebSocket'
import {
  buildForwardFromLegacyRefs,
  mapForwardWarningFromApi,
} from '@/pages/alert/utils/mapWarningsApi'
import {
  fetchForwardWarningByFile,
  fetchForwardWarningByQb,
  submitAnalyzeQbReferences,
  WarningsApiError,
} from '@/services/warnings-api'
import type { ForwardWarningResult } from '@/types/warnings'

const { Text } = Typography

export function ForwardTab() {
  const { message } = App.useApp()
  const [qbCode, setQbCode] = useState('')
  const [forwardFile, setForwardFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ForwardWarningResult | null>(null)
  const completionRef = useRef(false)

  const applyResult = useCallback((next: ForwardWarningResult) => {
    setResult(next)
  }, [])

  const handleWsResults = useCallback(
    (refs: unknown[], meta: Record<string, unknown>) => {
      if (completionRef.current) return
      completionRef.current = true
      const code =
        String(
          meta.subject_code ?? meta.qb_code ?? meta.enterprise_standard ?? meta.source_bz_id ?? qbCode,
        ).trim() ||
        forwardFile?.name.replace(/\.[^/.]+$/i, '') ||
        '—'
      applyResult(buildForwardFromLegacyRefs(code, refs))
      void (async () => {
        try {
          if (forwardFile) {
            const api = await fetchForwardWarningByFile(forwardFile, code !== '—' ? code : undefined)
            applyResult(mapForwardWarningFromApi(api))
          } else if (code !== '—') {
            const api = await fetchForwardWarningByQb(code)
            applyResult(mapForwardWarningFromApi(api))
          }
        } catch {
          /* 新接口未就绪时保留 legacy 映射 */
        }
      })()
      message.success('文件解析结果已接收')
    },
    [applyResult, forwardFile, message, qbCode],
  )

  const { isConnected, ensureConnected } = useDifyWebSocket(handleWsResults)

  const runByQbCode = async () => {
    const code = qbCode.trim()
    if (!code) {
      message.warning('请输入企标号')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const api = await fetchForwardWarningByQb(code)
      applyResult(mapForwardWarningFromApi(api))
    } catch (e) {
      const err = e as WarningsApiError
      if (err.status === 404 || err.status === 422 || err.message.includes('empty_history')) {
        applyResult({
          qbCode: code,
          taskConclusion: 'empty_history',
          taskSummary:
            err.message ||
            '未找到该企标的合规或批量规范性引用评价记录，无法做「上次 vs 本次」比对。',
          compareRows: [],
        })
      } else {
        message.error(err.message || '正向预警查询失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const runByFile = async () => {
    if (!forwardFile) {
      message.warning('请先上传企标文件')
      return
    }
    completionRef.current = false
    setLoading(true)
    setResult({
      qbCode: qbCode.trim() || forwardFile.name,
      taskConclusion: 'pending',
      taskSummary: '文件已提交，正在解析…',
      compareRows: [],
    })
    ensureConnected()
    try {
      const ack = await submitAnalyzeQbReferences(forwardFile)
      if (ack.code !== undefined && ack.code !== 200 && ack.code !== 0) {
        throw new WarningsApiError(ack.msg || '提交解析失败')
      }
      message.info('文件已提交后台解析；完成后将通过 WebSocket 推送，或可稍后按企标号查询。')
      try {
        const api = await fetchForwardWarningByFile(
          forwardFile,
          qbCode.trim() || undefined,
        )
        completionRef.current = true
        applyResult(mapForwardWarningFromApi(api))
        message.success('已获取预警比对结果')
      } catch {
        /* 异步：等待 WS */
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const panelStyle = {
    background: '#fff',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
    padding: '28px 28px 24px',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  } as const

  return (
    <div style={{ marginTop: 4 }}>
      <div style={panelStyle}>
        <div
          style={{
            background: '#f0f2f5',
            borderRadius: 16,
            padding: '20px 22px 18px',
          }}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 14, fontSize: 13 }}>
            输入企标号可基于系统评价记录比对；上传文件将解析引用后展示相同五列表格。
          </Text>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Input
              size="large"
              placeholder="请输入企标号，例如：Q/XXX 001-2020"
              value={qbCode}
              onChange={(e) => setQbCode(e.target.value)}
              onPressEnter={() => void runByQbCode()}
              prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
              style={{
                flex: '1 1 280px',
                minWidth: 0,
                height: 46,
                borderRadius: 999,
                background: '#fff',
                border: '1px solid #e8e8e8',
              }}
            />
            <Button
              type="primary"
              size="large"
              loading={loading && !forwardFile}
              onClick={() => void runByQbCode()}
              style={{
                minWidth: 132,
                height: 46,
                borderRadius: 999,
                boxShadow: '0 6px 18px rgba(0, 102, 255, 0.28)',
              }}
            >
              正向预警
            </Button>
          </div>

          <Divider plain style={{ margin: '14px 0 12px', color: '#bfbfbf', fontSize: 13 }}>
            或上传企标文件（PDF / Word）
          </Divider>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              background: '#fff',
              borderRadius: 12,
              padding: '10px 14px',
              border: forwardFile ? '1px solid #c4b5fd' : '1px dashed #d0d7de',
              boxShadow: forwardFile ? '0 0 0 2px rgba(124, 58, 237, 0.08)' : undefined,
            }}
          >
            {!forwardFile ? (
              <>
                <Upload
                  accept=".pdf,.doc,.docx"
                  multiple={false}
                  showUploadList={false}
                  beforeUpload={() => false}
                  onChange={(info) => {
                    const f = info.fileList[info.fileList.length - 1]?.originFileObj
                    setForwardFile(f ?? null)
                  }}
                >
                  <Button size="large" icon={<UploadOutlined />} style={{ borderRadius: 8 }}>
                    选择文件
                  </Button>
                </Upload>
                <Text type="secondary" style={{ fontSize: 13, flex: '1 1 200px' }}>
                  若已知企标号，建议同时在上方填写以便关联评价记录
                </Text>
              </>
            ) : (
              <>
                <FileTextOutlined style={{ fontSize: 22, color: '#7c3aed', flexShrink: 0 }} />
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <Text strong ellipsis={{ tooltip: forwardFile.name }} style={{ display: 'block' }}>
                    {forwardFile.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {[formatFileSize(forwardFile.size), getFileExtensionUpper(forwardFile.name)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                <Button size="small" onClick={() => setForwardFile(null)}>
                  移除
                </Button>
                <Button
                  type="primary"
                  size="large"
                  loading={loading}
                  onClick={() => void runByFile()}
                  style={{ borderRadius: 999, minWidth: 128 }}
                >
                  分析预警
                </Button>
              </>
            )}
          </div>

          {!isConnected && forwardFile ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
              WebSocket 未连接时仍可提交解析，建议解析完成后使用企标号再次查询完整比对。
            </Text>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 22,
            background: '#f0f2f5',
            borderRadius: 16,
            padding: result || loading ? 20 : '40px 24px',
            minHeight: 280,
          }}
        >
          {loading && !result ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: '#595959' }}>正在分析…</div>
            </div>
          ) : !result ? (
            <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              <ForwardSearchEmptyGraphic />
              <div style={{ fontSize: 16, fontWeight: 600 }}>输入企标号或上传文件开始正向预警</div>
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                系统将比对「上次规范性引用查新结果」与「本次实时查新结果」
              </Text>
            </div>
          ) : (
            <>
              <WarningTaskConclusionBanner
                taskConclusion={result.taskConclusion}
                taskSummary={result.taskSummary}
                qbCode={result.qbCode}
                enterpriseName={result.enterpriseName}
              />
              {result.taskConclusion === 'empty_history' ? (
                <Empty description="无评价记录，无法展示比对表" />
              ) : result.compareRows.length > 0 ? (
                <WarningCompareTable dataSource={result.compareRows} loading={loading} />
              ) : result.taskConclusion === 'pending' ? (
                <Empty description="解析进行中，请稍候…" />
              ) : (
                <Empty description="暂无比对行数据" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
