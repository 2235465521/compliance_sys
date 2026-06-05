import { useMemo, useState } from 'react'
import {
  Card,
  List,
  Tag,
  Alert,
  Spin,
  Typography,
  Input,
  Button,
  Row,
  Col,
  Select,
} from 'antd'
import {
  WarningOutlined,
  NotificationOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  HourglassOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import type { AbolitionHintItem, DashboardHintDays, EffectiveHintItem } from '@/types/dashboard'
import { DASHBOARD_HINT_DAY_OPTIONS } from '@/types/dashboard'
import { filterByFuzzyKeyword } from '@/utils/fuzzyTextMatch'

const { Text, Title } = Typography

const DAY_SELECT_OPTIONS = DASHBOARD_HINT_DAY_OPTIONS.map((d) => ({
  value: d,
  label: `${d} 天`,
}))

/** 即将实施列表：多行填满右侧卡片，减少底部留白 */
const EFFECTIVE_LIST_PAGE_SIZE = 10
const RECENT_ABOLITION_PAGE_SIZE = 4
const SEARCH_PLACEHOLDER = '搜索标准号或名称（支持模糊匹配）'

const getDaysTagColor = (days: number) => {
  if (days <= 7) return '#cf1322'
  if (days <= 15) return '#fa8c16'
  return '#108ee9'
}

function formatAbolitionBadge(days: number): string {
  if (days === 0) return '废止日为今天'
  return `距废止还有 ${days} 天`
}

function formatEffectiveBadge(days: number): string {
  if (days === 0) return '实施日为今天'
  return `距实施还有 ${days} 天`
}

interface Props {
  abolitionLoading: boolean
  effectiveLoading: boolean
  abolitionDays: DashboardHintDays
  recentDays: DashboardHintDays
  effectiveDays: DashboardHintDays
  onAbolitionDaysChange: (days: DashboardHintDays) => void
  onRecentDaysChange: (days: DashboardHintDays) => void
  onEffectiveDaysChange: (days: DashboardHintDays) => void
  asOf?: string
  upcoming: AbolitionHintItem[]
  recent: AbolitionHintItem[]
  effectiveAsOf?: string
  effectiveUpcoming: EffectiveHintItem[]
}

export default function DashboardAlerts({
  abolitionLoading,
  effectiveLoading,
  abolitionDays,
  recentDays,
  effectiveDays,
  onAbolitionDaysChange,
  onRecentDaysChange,
  onEffectiveDaysChange,
  asOf,
  upcoming,
  recent,
  effectiveAsOf,
  effectiveUpcoming,
}: Props) {
  const [abolitionSearchText, setAbolitionSearchText] = useState('')
  const [abolitionSortOrder, setAbolitionSortOrder] = useState<'asc' | 'desc'>('asc')
  const [effectiveSearchText, setEffectiveSearchText] = useState('')
  const [effectiveSortOrder, setEffectiveSortOrder] = useState<'asc' | 'desc'>('asc')
  const [recentSearchText, setRecentSearchText] = useState('')
  const [recentSortOrder, setRecentSortOrder] = useState<'asc' | 'desc'>('asc')

  const processedUpcoming = useMemo(() => {
    let filtered = filterByFuzzyKeyword(upcoming, abolitionSearchText)
    filtered = [...filtered].sort((a, b) =>
      abolitionSortOrder === 'asc'
        ? a.daysFromToday - b.daysFromToday
        : b.daysFromToday - a.daysFromToday,
    )
    return filtered
  }, [upcoming, abolitionSearchText, abolitionSortOrder])

  const processedEffectiveUpcoming = useMemo(() => {
    let filtered = filterByFuzzyKeyword(effectiveUpcoming, effectiveSearchText)
    filtered = [...filtered].sort((a, b) =>
      effectiveSortOrder === 'asc'
        ? a.daysFromToday - b.daysFromToday
        : b.daysFromToday - a.daysFromToday,
    )
    return filtered
  }, [effectiveUpcoming, effectiveSearchText, effectiveSortOrder])

  const processedRecent = useMemo(() => {
    let filtered = filterByFuzzyKeyword(recent, recentSearchText)
    filtered = [...filtered].sort((a, b) =>
      recentSortOrder === 'asc'
        ? b.daysFromToday - a.daysFromToday
        : a.daysFromToday - b.daysFromToday,
    )
    return filtered
  }, [recent, recentSearchText, recentSortOrder])

  const cardStyle = {
    height: '100%' as const,
    borderRadius: 16,
    boxShadow: '0 4px 20px -8px rgba(0,0,0,0.05)',
    border: 'none' as const,
  }

  const cardStyles = {
    header: { borderBottom: '1px solid #f1f5f9', padding: '14px 20px' },
    body: { padding: '16px 20px' },
  }

  const asOfParts = [asOf, effectiveAsOf].filter(Boolean)
  const metaLine =
    asOfParts.length > 0
      ? `数据截至 ${[...new Set(asOfParts)].join(' / ')}`
      : undefined

  return (
    <div className="dashboard-timeliness-section">
      <div className="dashboard-timeliness-section__head">
        <Title level={5} style={{ margin: 0, color: '#1e293b' }}>
          标准时效提醒
        </Title>
        {metaLine ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {metaLine}
          </Text>
        ) : null}
      </div>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={14} style={{ display: 'flex' }}>
          <Card
            style={{ ...cardStyle, flex: 1 }}
            styles={cardStyles}
            title={
              <div className="dashboard-timeliness-card__title">
                <span>
                  <HourglassOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                  即将废止
                </span>
                <Text type="secondary" className="dashboard-timeliness-card__subtitle">
                  未来 {abolitionDays} 天内
                </Text>
              </div>
            }
            extra={
              <Select<DashboardHintDays>
                size="small"
                value={abolitionDays}
                options={DAY_SELECT_OPTIONS}
                onChange={onAbolitionDaysChange}
                style={{ width: 96 }}
                disabled={abolitionLoading}
              />
            }
          >
            <div className="dashboard-alert-toolbar">
              <Input
                placeholder={SEARCH_PLACEHOLDER}
                prefix={<SearchOutlined />}
                allowClear
                value={abolitionSearchText}
                onChange={(e) => setAbolitionSearchText(e.target.value)}
                style={{ borderRadius: 8 }}
              />
              <Button
                type="text"
                icon={
                  abolitionSortOrder === 'asc' ? (
                    <SortAscendingOutlined />
                  ) : (
                    <SortDescendingOutlined />
                  )
                }
                onClick={() =>
                  setAbolitionSortOrder(abolitionSortOrder === 'asc' ? 'desc' : 'asc')
                }
                title={
                  abolitionSortOrder === 'asc'
                    ? '当前：最近废止日优先（点击切换）'
                    : '当前：较晚废止日优先（点击切换）'
                }
              />
            </div>
            <Spin spinning={abolitionLoading}>
              <List
                itemLayout="horizontal"
                dataSource={processedUpcoming}
                pagination={{
                  pageSize: 4,
                  size: 'small',
                  hideOnSinglePage: true,
                  showSizeChanger: false,
                }}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      padding: '14px 0',
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <Text
                          strong
                          style={{ fontSize: 15, color: '#334155', wordBreak: 'break-word' }}
                        >
                          {item.stdCode} {item.stdName}
                        </Text>
                      }
                      description={
                        <span style={{ color: '#94a3b8' }}>
                          状态：{item.stdStatus} · 废止日 {item.abolitionDate}
                        </span>
                      }
                    />
                    <div style={{ flexShrink: 0 }}>
                      <Tag
                        color={getDaysTagColor(item.daysFromToday)}
                        style={{
                          fontSize: '13px',
                          padding: '4px 10px',
                          borderRadius: 6,
                          marginRight: 0,
                        }}
                      >
                        {formatAbolitionBadge(item.daysFromToday)}
                      </Tag>
                    </div>
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ padding: '32px', color: '#94a3b8' }}>
                      {abolitionSearchText.trim()
                        ? '无匹配的标准'
                        : `未来 ${abolitionDays} 天内暂无即将废止的标准`}
                    </div>
                  ),
                }}
              />
            </Spin>

            <div className="dashboard-timeliness-recent">
              <div className="dashboard-timeliness-recent__head">
                <div className="dashboard-timeliness-recent__head-left">
                  <WarningOutlined style={{ color: '#faad14', marginRight: 6 }} />
                  <Text strong>近期已废止</Text>
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                    近 {recentDays} 天内
                  </Text>
                </div>
                <Select<DashboardHintDays>
                  size="small"
                  value={recentDays}
                  options={DAY_SELECT_OPTIONS}
                  onChange={onRecentDaysChange}
                  style={{ width: 96 }}
                  disabled={abolitionLoading}
                />
              </div>
              <div className="dashboard-alert-toolbar">
                <Input
                  placeholder={SEARCH_PLACEHOLDER}
                  prefix={<SearchOutlined />}
                  allowClear
                  value={recentSearchText}
                  onChange={(e) => setRecentSearchText(e.target.value)}
                  style={{ borderRadius: 8 }}
                />
                <Button
                  type="text"
                  icon={
                    recentSortOrder === 'asc' ? (
                      <SortAscendingOutlined />
                    ) : (
                      <SortDescendingOutlined />
                    )
                  }
                  onClick={() =>
                    setRecentSortOrder(recentSortOrder === 'asc' ? 'desc' : 'asc')
                  }
                  title={
                    recentSortOrder === 'asc'
                      ? '当前：最近废止优先（点击切换）'
                      : '当前：较早废止优先（点击切换）'
                  }
                />
              </div>
              <Spin spinning={abolitionLoading}>
                <List
                  dataSource={processedRecent}
                  pagination={{
                    pageSize: RECENT_ABOLITION_PAGE_SIZE,
                    size: 'small',
                    hideOnSinglePage: true,
                    showSizeChanger: false,
                  }}
                  renderItem={(item) => (
                    <List.Item style={{ borderBottom: 'none', padding: '0 0 10px 0' }}>
                      <Alert
                        message={`${item.stdCode} · ${item.stdName}`}
                        description={
                          <span>
                            状态：{item.stdStatus} · 废止日 {item.abolitionDate}
                            {item.daysFromToday < 0
                              ? `（已废止 ${Math.abs(item.daysFromToday)} 天）`
                              : null}
                          </span>
                        }
                        type="error"
                        showIcon
                        icon={<NotificationOutlined />}
                        action={<Tag color="error">已废止</Tag>}
                        style={{ width: '100%', borderRadius: 8 }}
                      />
                    </List.Item>
                  )}
                  locale={{
                    emptyText: (
                      <div style={{ padding: '16px', color: '#94a3b8', fontSize: 13 }}>
                        {recentSearchText.trim()
                          ? '无匹配的标准'
                          : `近 ${recentDays} 天内暂无已废止记录`}
                      </div>
                    ),
                  }}
                />
              </Spin>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10} className="dashboard-timeliness-effective-col" style={{ display: 'flex' }}>
          <Card
            className="dashboard-timeliness-effective-card"
            style={{ ...cardStyle, flex: 1 }}
            styles={cardStyles}
            title={
              <div className="dashboard-timeliness-card__title">
                <span>
                  <RocketOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  即将实施
                </span>
                <Text type="secondary" className="dashboard-timeliness-card__subtitle">
                  未来 {effectiveDays} 天内
                </Text>
              </div>
            }
            extra={
              <Select<DashboardHintDays>
                size="small"
                value={effectiveDays}
                options={DAY_SELECT_OPTIONS}
                onChange={onEffectiveDaysChange}
                style={{ width: 96 }}
                disabled={effectiveLoading}
              />
            }
          >
            <div className="dashboard-alert-toolbar">
              <Input
                placeholder={SEARCH_PLACEHOLDER}
                prefix={<SearchOutlined />}
                allowClear
                value={effectiveSearchText}
                onChange={(e) => setEffectiveSearchText(e.target.value)}
                style={{ borderRadius: 8 }}
              />
              <Button
                type="text"
                icon={
                  effectiveSortOrder === 'asc' ? (
                    <SortAscendingOutlined />
                  ) : (
                    <SortDescendingOutlined />
                  )
                }
                onClick={() =>
                  setEffectiveSortOrder(effectiveSortOrder === 'asc' ? 'desc' : 'asc')
                }
                title={
                  effectiveSortOrder === 'asc'
                    ? '当前：最近实施日优先（点击切换）'
                    : '当前：较晚实施日优先（点击切换）'
                }
              />
            </div>
            <Spin spinning={effectiveLoading}>
              <List
                itemLayout="horizontal"
                dataSource={processedEffectiveUpcoming}
                pagination={{
                  pageSize: EFFECTIVE_LIST_PAGE_SIZE,
                  size: 'small',
                  hideOnSinglePage: true,
                  showSizeChanger: false,
                  showQuickJumper:
                    processedEffectiveUpcoming.length > EFFECTIVE_LIST_PAGE_SIZE * 3,
                }}
                renderItem={(item) => (
                  <List.Item className="dashboard-timeliness-effective-item">
                    <List.Item.Meta
                      title={
                        <Text
                          strong
                          className="dashboard-timeliness-effective-item__title"
                        >
                          {item.stdCode} {item.stdName}
                        </Text>
                      }
                      description={
                        <span className="dashboard-timeliness-effective-item__desc">
                          状态：{item.stdStatus} · 实施日 {item.effectiveDate}
                        </span>
                      }
                    />
                    <div style={{ flexShrink: 0 }}>
                      <Tag
                        color={getDaysTagColor(item.daysFromToday)}
                        style={{
                          fontSize: '13px',
                          padding: '4px 10px',
                          borderRadius: 6,
                          marginRight: 0,
                        }}
                      >
                        {formatEffectiveBadge(item.daysFromToday)}
                      </Tag>
                    </div>
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ padding: '40px', color: '#94a3b8' }}>
                      {effectiveSearchText.trim()
                        ? '无匹配的标准'
                        : `未来 ${effectiveDays} 天内暂无即将实施的标准`}
                    </div>
                  ),
                }}
              />
            </Spin>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
