import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Typography,
  Spin,
  Row,
  Col,
  Tabs,
  Input,
  Upload,
  Empty
} from 'antd';
import {
  WarningOutlined,
  BellOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  AuditOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  ApartmentOutlined,
  BulbOutlined,
  FileTextOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const { Dragger } = Upload;

// 定义预警数据类型
interface WarningItem {
  id: number;
  enterprise_bz_id: string;
  national_bz_id: string;
  warning_type: 'upcoming_implementation' | 'obsolete_standard' | 'changed_requirement' | 'other';
  status: 'unread' | 'read' | 'resolved';
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  related_standards?: string[];
}

// 企标分析结果类型
interface EnterpriseAnalysisResult {
  id: number;
  enterprise_standard: string;
  publish_date: string;
  referenced_standards: {
    standard_code: string;
    extracted_info: string;
    matched_trace: string;
    status: '废止' | '现行' | '即将实施' | '处理中';
    latest_version?: string;
    repair_suggestion: string;
  }[];
}

/** 正向引用标准卡片：仅 UI 配色（与状态字段对应） */
function getForwardRefCardTheme(status: string): {
  bg: string;
  border: string;
  tag: React.ReactNode;
} {
  switch (status) {
    case '废止':
      return {
        bg: '#fff1f0',
        border: '#ffa39e',
        tag: (
          <span style={{ color: '#cf1322', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <StopOutlined /> 废止
          </span>
        )
      };
    case '现行':
      return {
        bg: '#f6ffed',
        border: '#b7eb8f',
        tag: (
          <span style={{ color: '#389e0d', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircleOutlined /> 现行
          </span>
        )
      };
    case '即将实施':
      return {
        bg: '#fffbe6',
        border: '#ffe58f',
        tag: (
          <span style={{ color: '#d48806', fontSize: 13 }}>
            <WarningOutlined style={{ marginRight: 4 }} />
            即将实施
          </span>
        )
      };
    case '处理中':
      return {
        bg: '#e6f7ff',
        border: '#91d5ff',
        tag: <span style={{ color: '#0958d9', fontSize: 13 }}>处理中</span>
      };
    default:
      return {
        bg: '#fafafa',
        border: '#d9d9d9',
        tag: (
          <span style={{ color: '#8c8c8c', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <QuestionCircleOutlined /> 未知
          </span>
        )
      };
  }
}

/** 后端预警项常用 create_time，旧代码只读 created_at 会导致「最近」判断永远为假 */
function getWarningItemTimeRaw(item: Record<string, unknown>): string | undefined {
  const v =
    item.create_time ?? item.created_at ?? item.updated_at ?? item.update_time;
  return typeof v === 'string' ? v : undefined;
}

function getWarningItemTimeMs(item: Record<string, unknown>): number | null {
  const raw = getWarningItemTimeRaw(item);
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** 从上传文件名构造检索词；勿用 split('.')[0]，否则会截断 Q_0357.2-2013 这类编号 */
function buildUploadFilenameMatchTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[^/.]+$/i, '').trim();
  if (!base) return [];
  const tokens = new Set<string>();
  const lower = base.toLowerCase();
  tokens.add(lower);
  tokens.add(lower.replace(/\s+/g, ''));
  tokens.add(lower.replace(/\//g, '_'));
  // 优先提取“企标编号”这种强特征（含数字+年代），避免用“乌龙茶/第2部分”等弱关键词误命中
  const qStrong = base.match(/[qQ][/_]\d+(?:\.\d+)*-\d{4}/);
  if (qStrong) {
    const q = qStrong[0].toLowerCase();
    tokens.add(q);
    tokens.add(q.replace(/\//g, '_'));
    tokens.add(q.replace(/_/g, '/'));
  } else {
    // 兜底：提取 Q/_ 开头的片段（可能没有年代）
    const qStd = base.match(/[qQ][/_][^\s]+/);
    if (qStd) tokens.add(qStd[0].toLowerCase());
  }
  for (const part of base.split(/[\s_\-—–:：.。]+/)) {
    const p = part.trim().toLowerCase();
    // 仅保留更“硬”的 token：必须含数字，且长度至少 5（避免“茶/第/部分”等噪声）
    if (p.length >= 5 && /\d/.test(p)) tokens.add(p);
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

function warningItemSearchBlob(item: Record<string, unknown>): string {
  const fields = [
    item.quote_bz,
    item.enterprise_bz_id,
    item.old_bz_id,
    item.new_bz_id,
    item.title,
    item.description,
    item.message
  ];
  const core = fields
    .filter((x): x is string => typeof x === 'string')
    .join(' ')
    .toLowerCase();
  if (!core) return '';
  return `${core} ${core.replace(/\//g, '_')} ${core.replace(/_/g, '/')}`;
}

function filterWarningsMatchingUpload(
  items: Record<string, unknown>[],
  fileName: string
): Record<string, unknown>[] {
  const tokens = buildUploadFilenameMatchTokens(fileName);
  if (tokens.length === 0) return [];

  // 仅使用“强 token”：含数字且长度 >= 8（例如 Q_0357.2-2013）
  const strongTokens = tokens.filter((t) => t.length >= 8 && /\d/.test(t));
  const tokensToUse = strongTokens.length > 0 ? strongTokens : tokens.filter((t) => t.length >= 10);
  if (tokensToUse.length === 0) return [];

  return items.filter((item) => {
    const hay = warningItemSearchBlob(item);
    return tokensToUse.some((tok) => hay.includes(tok));
  });
}

/** 反向预警空状态插图（图1风格：检索 + 文档） */
function ReverseSearchEmptyGraphic() {
  return (
    <div
      style={{
        width: 132,
        height: 132,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #3d4a5c 0%, #1f2937 55%, #111827 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)'
      }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <rect x="18" y="22" width="34" height="44" rx="3" fill="#e2e8f0" opacity="0.9" />
        <rect x="24" y="28" width="22" height="3" rx="1" fill="#94a3b8" />
        <rect x="24" y="34" width="18" height="3" rx="1" fill="#94a3b8" />
        <rect x="28" y="18" width="34" height="44" rx="3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        <rect x="34" y="26" width="22" height="2.5" rx="1" fill="#cbd5e1" />
        <rect x="34" y="32" width="16" height="2.5" rx="1" fill="#cbd5e1" />
        <circle cx="52" cy="48" r="16" stroke="#0066ff" strokeWidth="3.5" fill="rgba(0,102,255,0.12)" />
        <line x1="63" y1="59" x2="72" y2="68" stroke="#0066ff" strokeWidth="4" strokeLinecap="round" />
        <rect x="44" y="40" width="14" height="10" rx="1" fill="#0066ff" opacity="0.85" />
        <rect x="46" y="42" width="4" height="6" rx="0.5" fill="#fff" opacity="0.9" />
        <rect x="52" y="44" width="4" height="4" rx="0.5" fill="#fff" opacity="0.7" />
      </svg>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExtensionUpper(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toUpperCase();
}

/** 正向预警空状态插图（图2：上传文档解析） */
function ForwardUploadEmptyGraphic() {
  return (
    <div
      style={{
        width: 132,
        height: 132,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 28%, #4c1d95 0%, #5b21b6 45%, #312e81 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: '0 12px 28px rgba(91, 33, 182, 0.22)'
      }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <path
          d="M28 20h26l12 12v36a4 4 0 01-4 4H28a4 4 0 01-4-4V24a4 4 0 014-4z"
          fill="#faf5ff"
          stroke="#a78bfa"
          strokeWidth="1.8"
        />
        <path d="M54 20v12h12" fill="#ede9fe" stroke="#a78bfa" strokeWidth="1.8" />
        <rect x="32" y="40" width="28" height="3" rx="1" fill="#c4b5fd" />
        <rect x="32" y="48" width="22" height="3" rx="1" fill="#c4b5fd" />
        <circle cx="48" cy="62" r="14" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="2.5" />
        <path d="M44 62l4 4 8-9" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const AlertPage: React.FC = () => {
  // 使用 Modal hooks 避免上下文警告
  const [modalApi, modalContextHolder] = Modal.useModal();

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  /** 与 setState 不同步：任一路径（WS/HTTP）已给出正向解析最终结果，避免重复「处理完成」弹窗 */
  const forwardCompletionHandledRef = React.useRef(false);
  /** 与轮询 interval 同步，便于在 WebSocket 回调里可靠 clearInterval（避免闭包拿到旧的 pollingIntervalId） */
  const pollingIntervalRef = React.useRef<number | null>(null);
  /** 可选：在 sessionStorage 手动设置 ws_url 时，WebSocket 优先连该地址 */
  const [wsUrlOverride] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem('ws_url') || '';
    } catch {
      return '';
    }
  });

  const normalizeWsUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s) return null;
    try {
      if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s);
    } catch {
      // ignore
    }
    if (s.startsWith('ws://') || s.startsWith('wss://')) return s;
    return null;
  };

  // 添加轮询相关状态
  const [pollingIntervalId, setPollingIntervalId] = useState<number | null>(null);

  // 添加处理完成状态，防止重复显示弹窗
  const [processingCompleted, setProcessingCompleted] = useState<boolean>(false);

  // 状态管理
  const [activeTab, setActiveTab] = useState<string>('reverse-alert'); // 默认显示反向预警
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [forwardWarnings, setForwardWarnings] = useState<EnterpriseAnalysisResult[]>([]); // 正向预警结果
  const [loading, setLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [selectedWarning, setSelectedWarning] = useState<WarningItem | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  // 修改 activeTab 时停止任何正在进行的轮询
  useEffect(() => {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
  }, [activeTab, pollingIntervalId]);

  // 反向预警搜索状态
  const [reverseSearchTerm, setReverseSearchTerm] = useState<string>('');

  // 反向预警详情状态
  const [reverseAlertDetails, setReverseAlertDetails] = useState<{
    oldStandard: string;
    newStandard: string;
    affectedEnterprises: string[];
  } | null>(null);

  // 正向预警状态
  const [forwardFile, setForwardFile] = useState<File | null>(null);
  const [, setForwardResults] = useState<any[]>([]);

  // API 基础配置
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  // 获取预警列表
  const fetchWarnings = async () => {
    try {
      setLoading(true);

      // 首先尝试文档中提到的、我们确认有数据的端点: /api/warnings/list
      console.log('开始请求预警列表:', `${API_BASE_URL}/warnings/list`);
      const response = await axios.get(`${API_BASE_URL}/warnings/list`);
      console.log('API响应数据:', response);

      // 根据您确认的数据格式处理响应
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        const warningData: WarningItem[] = response.data.data.map((item: any) => ({
          id: item.id,
          enterprise_bz_id: item.quote_bz || 'N/A',
          national_bz_id: item.new_bz_id || 'N/A',
          warning_type: 'upcoming_implementation',
          status: item.is_read ? 'read' : 'unread',
          created_at: item.create_time,
          updated_at: item.update_time || item.create_time,
          title: `标准冲突预警: ${item.old_bz_id} -> ${item.new_bz_id}`,
          description: `检测到标准冲突：${item.old_bz_id} 与 ${item.new_bz_id} 存在冲突，影响企业标准: ${item.quote_bz || '未知'}`,
          related_standards: [item.old_bz_id, item.new_bz_id]
        })) as WarningItem[];

        setWarnings(warningData);
        console.log(`获取到 ${warningData.length} 条预警数据`);
      } else {
        console.error('API响应格式不符合预期:', response.data);

        // 如果首选端点失败，尝试标准DRF端点
        console.log('尝试备用API端点: /api/warnings/');
        const backupResponse = await axios.get(`${API_BASE_URL}/warnings/`);

        let warningData: WarningItem[] = [];

        if (backupResponse.data && Array.isArray(backupResponse.data)) {
          // 如果直接返回数组
          warningData = backupResponse.data as WarningItem[];
        } else if (backupResponse.data && backupResponse.data.results) {
          // 如果是分页格式
          warningData = backupResponse.data.results as WarningItem[];
        }

        setWarnings(warningData);
        console.log(`从备用端点获取到 ${warningData.length} 条预警数据`);
      }
    } catch (error) {
      console.error('获取预警列表失败:', error);

      // 检查错误类型
      if (axios.isAxiosError(error)) {
        console.error('API错误详情:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url
        });
      } else {
        console.error('未知错误:', error);
      }

      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  // 反向预警搜索：输入国标，输出关联企标
  const searchReverseAlert = async () => {
    if (!reverseSearchTerm.trim()) return;

    // 在开始新搜索前，先停止任何现有的轮询
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }

    // 重置处理完成状态
    setProcessingCompleted(false);

    setSearchLoading(true);
    try {
      console.log('开始反向预警搜索:', `${API_BASE_URL}/standards/warning-trace/`, { bz_id: reverseSearchTerm });

      // 根据后端文档 section 2.5，使用 /api/standards/warning-trace/ 接口
      const response = await axios.get(`${API_BASE_URL}/standards/warning-trace/`, {
        params: {
          bz_id: reverseSearchTerm
        }
      });

      console.log('反向预警搜索响应:', response);

      // 根据文档 section 2.5，响应格式为
      // {
      //   "code": 200,
      //   "msg": "success",
      //   "data": {
      //     "is_safe": false,
      //     "input_bz": "GB/T 1.1-2009",
      //     "latest_bz": "GB/T 1.1-2020",
      //     "affected_enterprises": ["Q/ABC 001", "Q/XYZ 002"]
      //   }
      // }

      // 尝试多种可能的响应结构
      let hasValidData = false;
      let data = null;

      if (response.data && response.data.code === 200 && response.data.data) {
        // 标准后端API格式
        data = response.data.data;
        hasValidData = true;
      } else if (response.data && Array.isArray(response.data)) {
        // 如果直接返回数组
        data = {
          input_bz: reverseSearchTerm,
          latest_bz: '', // 无法确定，因为是数组格式
          affected_enterprises: response.data.map((item: any) => item.enterprise_bz_id || item.enterprise_standard || '未知企业标准')
        };
        hasValidData = response.data.length > 0;
      } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        // 其他对象格式
        data = {
          input_bz: response.data.input_bz || reverseSearchTerm,
          latest_bz: response.data.latest_bz || '',
          affected_enterprises: response.data.affected_enterprises || response.data.data?.affected_enterprises || []
        };
        hasValidData = true;
      }

      if (hasValidData && data) {
        // 更新详细预警信息
        setReverseAlertDetails({
          oldStandard: data.input_bz || reverseSearchTerm,
          newStandard: data.latest_bz || '无替代标准',
          affectedEnterprises: data.affected_enterprises || []
        });

        // 如果有替代信息，显示提示信息
        if (data.input_bz && data.latest_bz && data.input_bz !== data.latest_bz && data.latest_bz !== '') {
          modalApi.info({
            title: '发现底层引用标准变更!',
            content: (
              <div>
                <p>您查询的旧版标准: {data.input_bz}</p>
                <p>最新替代标准为: {data.latest_bz}</p>
                <p>受影响的企业标准清单:</p>
                {data.affected_enterprises && data.affected_enterprises.length > 0 && (
                  <ul>
                    {data.affected_enterprises.map((enterprise_bz: string, index: number) => (
                      <li key={index}>注意:企业标准 {enterprise_bz} 引用的国标{data.input_bz}已经被最新标准{data.latest_bz}替代，请及时通知!</li>
                    ))}
                  </ul>
                )}
                {(!data.affected_enterprises || data.affected_enterprises.length === 0) && (
                  <p>暂无关联企业标准</p>
                )}
              </div>
            ),
          });
        } else if (data.affected_enterprises && data.affected_enterprises.length > 0) {
          // 即使没有替代标准，如果有受影响的企业标准也显示
          modalApi.info({
            title: '关联企业标准查询结果',
            content: (
              <div>
                <p>查询标准: {data.input_bz || reverseSearchTerm}</p>
                <p>关联的企业标准清单:</p>
                <ul>
                  {data.affected_enterprises.map((enterprise_bz: string, index: number) => (
                    <li key={index}>企业标准: {enterprise_bz}</li>
                  ))}
                </ul>
              </div>
            ),
          });
        } else {
          modalApi.info({
            title: '查询结果',
            content: `未找到与标准 "${reverseSearchTerm}" 相关的替代信息或企业标准。`
          });
        }
      } else {
        setReverseAlertDetails(null);
        console.log('反向预警搜索未返回有效数据');

        modalApi.info({
          title: '查询结果',
          content: `未找到与标准 "${reverseSearchTerm}" 相关的企标信息。`
        });
      }
    } catch (error) {
      console.error('反向预警搜索失败:', error);

      if (axios.isAxiosError(error)) {
        console.error('API错误详情:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url
        });

        modalApi.error({
          title: '搜索失败',
          content: `反向预警搜索失败: ${error.message}. 请确认后端服务是否正常运行.`
        });
      } else {
        console.error('未知错误:', error);
        modalApi.error({
          title: '发生错误',
          content: '搜索反向预警时发生未知错误，请检查控制台日志。'
        });
      }

      setReverseAlertDetails(null);
    } finally {
      setSearchLoading(false);
    }
  };

  // 获取正向预警结果 - 用于轮询后台处理结果
  const fetchForwardAlertResult = async (fileName: string) => {
    try {
      // 根据后端文档：异步解析结果应通过 WebSocket 推送。
      // 这里的 HTTP 检查只作为兜底：从 /warnings/list 中按企标号强匹配可能生成的预警记录。
      const response = await axios.get(`${API_BASE_URL}/warnings/list`);
      console.log('使用警告列表作为兜底检查方法', response.data);

      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        const rawList = response.data.data as Record<string, unknown>[];
        const sorted = [...rawList].sort((a, b) => {
          const mb = getWarningItemTimeMs(b);
          const ma = getWarningItemTimeMs(a);
          if (mb !== null && ma !== null) return mb - ma;
          if (mb !== null) return 1;
          if (ma !== null) return -1;
          return 0;
        });

        const mapWarningRows = (rows: Record<string, unknown>[]) => ({
          isProcessing: false as const,
          data: {
            success: true,
            data: rows,
            referenced_standards: rows.map((item: any) => ({
              standard_code: item.new_bz_id || item.old_bz_id,
              extracted_info: item.description || '标准冲突分析',
              matched_trace: `企业标准 ${item.quote_bz || item.enterprise_bz_id} 与国标 ${item.new_bz_id} 冲突`,
              status: item.is_read ? '现行' : '待处理'
            }))
          }
        });

        const relevantData = filterWarningsMatchingUpload(sorted, fileName);
        if (relevantData.length > 0) {
          console.log('预警列表中与上传文件匹配的记录', relevantData);
          return mapWarningRows(relevantData);
        }

        return {
          isProcessing: false,
          data: {
            noSpecificResult: true,
            totalRecords: rawList.length,
            message:
              '未在预警列表中自动关联当前文件。按后端约定解析结果会通过 WebSocket 推送；若未收到推送，可能是 WebSocket 未连接/后端未推送。你也可以在「预警列表」里按企标号搜索确认是否已生成预警。'
          }
        };
      }

      // 格式不符时无法判断，提示稍后再试
      return {
        isProcessing: false,
        data: {
          noSpecificResult: true,
          totalRecords: Array.isArray(response.data?.data) ? response.data.data.length : undefined,
          message: '预警列表响应格式不符合预期，无法用其作为兜底判断。'
        }
      };
    } catch (error) {
      console.error('获取正向预警结果失败:', error);
      return { isProcessing: true, data: {} }; // 发生错误时假设仍在处理中
    }
  };

  type ForwardPollResult = NonNullable<Awaited<ReturnType<typeof fetchForwardAlertResult>>>;

  /** 轮询或手动「检查结果」时，在确认后台已返回完成态后统一更新表格与弹窗 */
  const applyForwardCompletedPollResult = (
    result: ForwardPollResult,
    file: File,
    opts?: { skipProcessingCompletedGuard?: boolean }
  ) => {
    if (result.isProcessing) return;

    setPollingIntervalId((prev) => {
      if (prev) clearInterval(prev);
      return null;
    });
    pollingIntervalRef.current = null;

    // WebSocket 已先推送并标记完成时，轮询闭包仍可能随后触发，此处直接退出（避免第二次「处理完成」弹窗）
    if (forwardCompletionHandledRef.current) {
      console.log('正向结果已由 WebSocket 处理，跳过 HTTP 兜底重复提示');
      return;
    }

    if (!opts?.skipProcessingCompletedGuard && processingCompleted) {
      console.log('处理已经完成过，不再重复处理');
      return;
    }

    forwardCompletionHandledRef.current = true;
    setProcessingCompleted(true);

    const data: any = result.data;

    if (data && data.noSpecificResult) {
      console.log('检测到大量数据但没有特定文件结果，显示提醒');
      modalApi.info({
        title: '处理完成提醒',
        content: data.message
          ? `${data.message}\n\n（当前预警库约 ${data.totalRecords ?? '—'} 条记录。）`
          : `文件 "${file.name}" 可能已处理完成。\n系统当前共有 ${data.totalRecords} 条预警数据，但未找到与您上传文件直接相关的具体结果。\n您可以稍后刷新页面查看最新预警列表，或联系管理员确认处理状态。`
      });
      fetchWarnings();
      return;
    }

    if ('error' in (result as any) && Boolean((result as any).error)) {
      console.log('文件处理失败，显示错误信息');
      const errorProcessedData: EnterpriseAnalysisResult[] = [{
        id: 1,
        enterprise_standard: file.name,
        publish_date: '处理失败',
        referenced_standards: [{
          standard_code: '处理失败',
          extracted_info: data?.msg || data?.message || '处理过程中发生错误',
          matched_trace: '请重新上传文件进行分析',
          status: '现行',
          repair_suggestion: '请检查文件格式或稍后重试'
        }]
      }];
      setForwardWarnings(errorProcessedData);
      modalApi.error({
        title: '处理失败',
        content: data?.msg || data?.message || '文件处理失败，请稍后重试'
      });
      return;
    }

    console.log('处理完成，显示结果', result.data);
    let enterpriseStandard = file.name;
    let publishDate = '解析完成';
    let referencedStandards: any[] = [];

    if (Array.isArray(data?.referenced_standards) && data.referenced_standards.length > 0) {
      referencedStandards = data.referenced_standards;
    } else {
      const apiData = data?.data !== undefined ? data.data : data;

      if (apiData && typeof apiData === 'object' && !Array.isArray(apiData)) {
        enterpriseStandard = apiData.enterprise_standard ||
          apiData.filename ||
          apiData.file_name ||
          file.name;

        publishDate = apiData.publish_date ||
          apiData.create_time ||
          apiData.date ||
          '解析完成';

        if (Array.isArray(apiData.referenced_standards)) {
          referencedStandards = apiData.referenced_standards;
        } else if (Array.isArray(apiData.references)) {
          referencedStandards = apiData.references;
        } else if (Array.isArray(apiData.data?.referenced_standards)) {
          referencedStandards = apiData.data.referenced_standards;
        } else {
          for (const key in apiData) {
            if (Array.isArray(apiData[key]) &&
              (key.includes('refer') || key.includes('standard') || key.includes('gb'))) {
              referencedStandards = apiData[key];
              break;
            }
          }
        }
      }
    }

    if (!Array.isArray(referencedStandards)) {
      referencedStandards = [];
    }

    referencedStandards = referencedStandards.filter((ref: any) => {
      if (typeof ref === 'object' && ref !== null) {
        if (ref.code || ref.msg) return false;
      }
      return true;
    });

    const processedData: EnterpriseAnalysisResult[] = [{
      id: 1,
      enterprise_standard: enterpriseStandard,
      publish_date: publishDate,
      referenced_standards: referencedStandards.map((ref: any, idx: number) => {
        let standardizedRef: any = {};

        if (typeof ref === 'string') {
          standardizedRef = { standard_code: ref };
        } else if (typeof ref === 'object' && ref !== null) {
          standardizedRef = ref;
        } else {
          standardizedRef = { standard_code: `未知标准${idx + 1}` };
        }

        return {
          standard_code: standardizedRef.standard_code ||
            standardizedRef.code ||
            standardizedRef.id ||
            standardizedRef.name ||
            `未知标准${idx + 1}`,
          extracted_info: standardizedRef.extracted_info ||
            standardizedRef.content ||
            standardizedRef.text ||
            standardizedRef.description ||
            '未提取到具体内容',
          matched_trace: standardizedRef.matched_trace ||
            standardizedRef.trace ||
            standardizedRef.matched_standard ||
            standardizedRef.source ||
            standardizedRef.origin ||
            '未匹配到具体溯源',
          status: standardizedRef.status ||
            standardizedRef.state ||
            (standardizedRef.is_obsolete ? '废止' : '现行'),
          latest_version: standardizedRef.latest_version ||
            standardizedRef.new_version ||
            standardizedRef.latest_standard ||
            standardizedRef.update_to ||
            undefined,
          repair_suggestion: standardizedRef.repair_suggestion ||
            standardizedRef.suggestion ||
            standardizedRef.advice ||
            standardizedRef.recommendation ||
            '暂无修复建议'
        };
      })
    }];

    setForwardWarnings(processedData);

    modalApi.success({
      title: '处理完成',
      content: '文件分析结果已接收！'
    });
  };

  // 正向预警搜索：输入企标文件，输出引用国标中的预警
  const searchForwardAlert = async () => {
    if (!forwardFile) return;

    // 正向预警结果按后端约定通过 WebSocket 推送
    ensureDifyWsConnected();

    // 在开始新搜索前，先停止任何现有的轮询
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }

    // 重置处理完成状态，准备新的处理流程
    setProcessingCompleted(false);
    forwardCompletionHandledRef.current = false;

    setSearchLoading(true);
    try {
      console.log('开始正向预警搜索:', `${API_BASE_URL}/analyze_qb_references_auto/`);
      console.log('上传文件:', forwardFile.name, forwardFile.size, forwardFile.type);

      // 创建FormData来上传文件
      const formData = new FormData();
      formData.append('file', forwardFile);

      // 添加额外的调试信息
      console.log('FormData内容:');
      for (let [key, value] of formData.entries()) {
        console.log(key, value);
      }

      // 调用后端的异步企标附件解析接口
      const response = await axios.post(`${API_BASE_URL}/analyze_qb_references_auto/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000 // 增加超时时间到60秒，因为文件分析可能需要更长时间
      });

      console.log('正向预警搜索响应:', response);

      // 不再假定任何特定的响应结构，直接使用响应数据
      let apiData = response.data;

      // 检查是否有错误
      if (response.data && (response.data.code !== undefined && response.data.code !== 200 && response.data.code !== 0)) {
        console.log('API返回错误:', response.data);
        throw new Error(response.data.msg || response.data.detail || 'API返回错误');
      }

      // 根据您期望的格式处理数据
      console.log('API响应原始数据:', apiData);

      // 特殊处理异步处理API响应
      // 如果返回格式为 {code: 200, msg: '文件已成功移交后台 AI 引擎...'}，则是异步处理确认
      if (apiData && typeof apiData === 'object' &&
          apiData.code === 200 && apiData.msg &&
          (apiData.msg.includes('移交后台') ||
           apiData.msg.includes('AI引擎') ||
           apiData.msg.includes('处理') ||
           apiData.msg.includes('解析完成后') ||
           apiData.msg.includes('解析完成'))) {

        // 这是异步处理确认消息，创建合适的响应数据
        const processedData: EnterpriseAnalysisResult[] = [{
          id: 1,
          enterprise_standard: forwardFile.name,
          publish_date: '处理中',
          referenced_standards: [{
            standard_code: '处理中...',
            extracted_info: apiData.msg,
            matched_trace: '后台AI引擎正在解析文件，请稍后刷新查看结果',
            status: '处理中',
            repair_suggestion: '系统正在分析文件内容，预计需要几分钟时间完成。'
          }]
        }];

        setForwardWarnings(processedData);
        setForwardResults(response.data); // 保存原始结果

        // 显示处理中消息
        modalApi.info({
          title: '文件已提交',
          content: (
            <div>
              <p>文件 "{forwardFile.name}" 已成功提交给后台AI引擎！</p>
              <p>解析过程可能需要几分钟时间，请稍后回来查看结果。</p>
              <p>您可以关闭此窗口进行其他操作，解析完成后系统将有通知。</p>
            </div>
          )
        });

        // 开始轮询处理结果
        const pollForResult = async () => {
          // 检查是否满足轮询条件
          if (!forwardFile) {
            console.log('没有文件，停止轮询');
            const pid = pollingIntervalRef.current;
            if (pid != null) {
              clearInterval(pid);
              pollingIntervalRef.current = null;
            }
            setPollingIntervalId(null);
            return;
          }

          // 只有在处理未完成时才继续轮询（用 ref，避免闭包中 processingCompleted 一直为旧值）
          if (forwardCompletionHandledRef.current) {
            console.log('处理已完成，停止轮询');
            const pid = pollingIntervalRef.current;
            if (pid != null) {
              clearInterval(pid);
              pollingIntervalRef.current = null;
            }
            setPollingIntervalId(null);
            return;
          }

          try {
            console.log('轮询检查处理结果，文件名:', forwardFile.name);
            const result = await fetchForwardAlertResult(forwardFile.name);

            if (result) {
              if (!result.isProcessing) {
                console.log('检测到处理已完成');
                applyForwardCompletedPollResult(result, forwardFile);
              } else {
                // 仍在处理中，继续显示处理中状态
                console.log('文件仍在处理中...');
              }
            } else {
              // 没有结果返回，可能还在处理中
              console.log('仍未获取到处理结果，继续轮询...');
            }
          } catch (error) {
            console.error('轮询结果时出错:', error);
            const pid = pollingIntervalRef.current;
            if (pid != null) {
              clearInterval(pid);
              pollingIntervalRef.current = null;
            }
            setPollingIntervalId(null);
          }
        };

        // 每5秒轮询一次结果，直到处理完成
        const intervalId = window.setInterval(pollForResult, 5000);
        pollingIntervalRef.current = intervalId;
        setPollingIntervalId(intervalId);

        return; // 退出函数，因为这是异步确认，不是实际结果
      }

      // 尝试多种可能的数据结构
      let enterpriseStandard = forwardFile.name;
      let publishDate = '未知日期';
      let referencedStandards = [];

      if (apiData && typeof apiData === 'object') {
        // 首先检查是否有data包装
        const actualData = apiData.data || apiData;

        // 尝试从不同可能的字段提取企业标准名称
        enterpriseStandard = actualData.enterprise_standard || actualData.filename || actualData.file_name ||
                           actualData.enterprise_bz || actualData.bz_name || forwardFile.name;

        // 尝试提取发布日期
        publishDate = actualData.publish_date || actualData.create_time || actualData.date ||
                     actualData.release_date || actualData.publish_time || '未知日期';

        // 查找引用标准信息 - 尝试多种可能的字段名
        if (Array.isArray(actualData.referenced_standards)) {
          referencedStandards = actualData.referenced_standards;
        } else if (Array.isArray(actualData.references)) {
          referencedStandards = actualData.references;
        } else if (Array.isArray(actualData.referenced_standards_list)) {
          referencedStandards = actualData.referenced_standards_list;
        } else if (Array.isArray(actualData.ref_standards)) {
          referencedStandards = actualData.ref_standards;
        } else if (Array.isArray(actualData.standards)) {
          referencedStandards = actualData.standards;
        } else if (actualData.references && Array.isArray(actualData.references.list)) {
          referencedStandards = actualData.references.list;
        } else if (actualData.content || actualData.analysis_result) {
          // 如果后端返回的是分析结果对象
          const content = actualData.content || actualData.analysis_result;
          if (typeof content === 'object' && content.references) {
            referencedStandards = Array.isArray(content.references) ? content.references : [content.references];
          } else if (typeof content === 'string' && content.includes('GB/')) {
            // 如果返回的是字符串格式，尝试从中提取标准号
            const gbPattern = /(GB\/[T\s]*\d+(?:\.\d+)*(?:-\d+)?)/g;
            const matches = content.match(gbPattern);
            if (matches) {
              referencedStandards = matches.map((match: string) => ({ standard_code: match.trim() }));
            }
          }
        } else if (Array.isArray(actualData)) {
          // 如果直接返回数组
          referencedStandards = actualData;
        } else if (typeof actualData === 'string') {
          // 如果返回字符串
          referencedStandards = [{ standard_code: actualData }];
        } else {
          // 最后尝试遍历对象的所有数组属性
          for (const key in actualData) {
            if (Array.isArray(actualData[key])) {
              if (key.toLowerCase().includes('refer') || key.toLowerCase().includes('standard') ||
                  key.toLowerCase().includes('gb') || key.toLowerCase().includes('bz')) {
                referencedStandards = actualData[key];
                break;
              }
            }
          }

          if (referencedStandards.length === 0) {
            // 如果还是找不到，尝试把整个对象作为一个条目
            referencedStandards = [actualData];
          }
        }
      } else {
        // 如果不是对象，可能是纯文本响应
        enterpriseStandard = forwardFile.name;
        publishDate = '未知日期';
        referencedStandards = [];
      }

      console.log('解析后的数据:', { enterpriseStandard, publishDate, referencedStandards });

      // 确保 referencedStandards 是数组且每个元素都有适当的结构
      if (!Array.isArray(referencedStandards)) {
        referencedStandards = [];
      }

      // 过滤掉无效的引用标准条目
      referencedStandards = referencedStandards.filter((ref: any) => {
        // 过滤掉 null, undefined 或空对象
        if (!ref) return false;
        // 过滤掉空字符串
        if (typeof ref === 'string' && ref.trim() === '') return false;
        // 如果是对象，确保它有一些有用的内容
        if (typeof ref === 'object') {
          return Object.keys(ref).some(key => ref[key] != null && ref[key] !== '');
        }
        return true;
      });

      // 如果经过过滤后没有有效数据，至少创建一个表示无数据的条目
      if (referencedStandards.length === 0) {
        // 检查响应中是否包含一些文本信息
        if (apiData && typeof apiData === 'object') {
          const allValues = Object.values(apiData).join(' ');
          if (allValues.includes('GB/') || allValues.includes('QB/') || allValues.includes('DB/')) {
            // 尝试从整个响应中提取标准号
            const stdRegex = /(GB\/[T\s]*\d+(?:\.\d+)*(?:-\d+)?|QB\/\d+(?:-\d+)?|DB\d+\/\d+)/gi;
            const stdMatches = allValues.match(stdRegex);
            if (stdMatches) {
              referencedStandards = stdMatches.map((std: string) => ({ standard_code: std.trim() }));
            }
          }
        }
      }

      // 构造企标分析结果 - 严格按照示例格式
      const processedData: EnterpriseAnalysisResult[] = [{
        id: 1,
        enterprise_standard: enterpriseStandard,
        publish_date: publishDate,
        referenced_standards: referencedStandards.length > 0 ? referencedStandards.map((ref: any, idx: number) => {
          // 标准化引用标准对象结构
          let normalizedRef: any = {};

          if (typeof ref === 'string') {
            // 如果是字符串，将其作为标准代码
            normalizedRef = { standard_code: ref };
          } else if (typeof ref === 'object' && ref !== null) {
            // 如果是对象，直接使用
            normalizedRef = ref;
          } else {
            // 其他情况，创建基本结构
            normalizedRef = { standard_code: `未知标准${idx + 1}` };
          }

          // 按照期望格式映射字段
          return {
            standard_code: normalizedRef.standard_code || normalizedRef.code ||
                          normalizedRef.standard || normalizedRef.ref_standard ||
                          normalizedRef.id || `未知标准${idx + 1}`,
            extracted_info: normalizedRef.extracted_info || normalizedRef.content ||
                           normalizedRef.text || normalizedRef.description || '未知内容',
            matched_trace: normalizedRef.matched_trace || normalizedRef.trace ||
                          normalizedRef.matched_standard || normalizedRef.source ||
                          normalizedRef.origin || '未知匹配',
            status: normalizedRef.status || normalizedRef.state ||
                   (normalizedRef.is_obsolete ? '废止' : '现行'), // 不包括废止时间、剩余天数和风险等级
            latest_version: normalizedRef.latest_version || normalizedRef.new_version ||
                           normalizedRef.latest_standard || normalizedRef.update_to || undefined,
            repair_suggestion: normalizedRef.repair_suggestion || normalizedRef.suggestion ||
                              normalizedRef.advice || normalizedRef.recommendation || '暂无建议'
          };
        }) : [] // 如果没有引用标准，则为空数组
      }];

      setForwardWarnings(processedData);
      setForwardResults(response.data); // 保存原始结果

      // 显示成功消息
      modalApi.success({
        title: '分析完成',
        content: `文件 "${forwardFile.name}" 分析完成！`
      });
    } catch (error) {
      console.error('正向预警搜索失败:', error);

      if (axios.isAxiosError(error)) {
        console.error('API错误详情:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url,
          headers: error.config?.headers,
          method: error.config?.method
        });

        // 根据不同状态码显示不同错误信息
        if (error.response?.status === 405) {
          modalApi.error({
            title: '接口错误',
            content: '接口不支持当前请求方法。请联系管理员确认API配置。'
          });
        } else if (error.response?.status === 400) {
          modalApi.error({
            title: '请求错误',
            content: `请求参数错误: ${JSON.stringify(error.response?.data)}`
          });
        } else if (error.response?.status === 413) {
          modalApi.error({
            title: '文件过大',
            content: '上传的文件太大，请压缩或分割文件后重试。'
          });
        } else if (error.response?.status === 415) {
          modalApi.error({
            title: '文件格式不支持',
            content: '上传的文件格式不受支持，请上传PDF或Word文档。'
          });
        } else if (error.response?.status === 500) {
          modalApi.error({
            title: '服务器错误',
            content: '服务器内部错误，请检查后端服务日志。'
          });
        } else {
          modalApi.error({
            title: '分析失败',
            content: `正向预警分析失败: ${error.message}. 请确认后端服务是否正常运行及文件格式是否正确。`
          });
        }
      } else if (error instanceof Error) {
        console.error('普通错误:', error);
        modalApi.error({
          title: '发生错误',
          content: `正向预警分析时发生错误: ${error.message}`
        });
      } else {
        console.error('未知错误:', error);
        modalApi.error({
          title: '发生未知错误',
          content: '正向预警分析时发生未知错误，请检查控制台日志。'
        });
      }

      // 即使出错也设置一个空结果，以便界面正确显示
      setForwardWarnings([{
        id: 1,
        enterprise_standard: forwardFile.name,
        publish_date: '未知日期',
        referenced_standards: []
      }]);
      setForwardResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // 上传文件处理
  const handleFileChange = (info: any) => {
    if (info.fileList.length > 0) {
      // 获取最后一个上传的文件
      const file = info.fileList[info.fileList.length - 1].originFileObj;
      setForwardFile(file);
    } else {
      setForwardFile(null);
    }
  };

  // 主动巡检功能
  const triggerActiveScan = async () => {
    try {
      console.log('开始主动巡检:', `${API_BASE_URL}/warnings/scan`);

      // 根据后端文档 section 5.1，使用 /api/warnings/scan 接口
      const response = await axios.post(`${API_BASE_URL}/warnings/scan`);
      console.log('巡检响应:', response);

      if (response.data && response.data.success) {
        modalApi.success({
          title: '巡检完成',
          content: response.data.message || `巡检完成！发现并处理了 ${response.data.processed_count || 0} 条冲突！`
        });

        // 重新获取预警列表以反映最新的巡检结果
        fetchWarnings();
      } else {
        modalApi.warning({
          title: '巡检结果',
          content: response.data.message || '巡检已完成，但未发现冲突。'
        });
      }
    } catch (error) {
      console.error('主动巡检失败:', error);
      // 检查错误类型
      if (axios.isAxiosError(error)) {
        console.error('API错误详情:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url
        });

        modalApi.error({
          title: '巡检失败',
          content: `主动巡检失败: ${error.message}. 请确认后端服务是否正常运行.`
        });
      } else {
        console.error('未知错误:', error);
        modalApi.error({
          title: '发生错误',
          content: '执行主动巡检时发生未知错误，请检查控制台日志。'
        });
      }
    }
  };

  // 手动检查处理结果（与自动轮询相同，调用接口拉取状态；不依赖 WebSocket）
  const checkProcessingResult = async () => {
    if (!forwardFile) {
      modalApi.warning({
        title: '无文件',
        content: '请先上传文件再检查结果。'
      });
      return;
    }

    setSearchLoading(true);
    try {
      const result = await fetchForwardAlertResult(forwardFile.name);
      if (result === null) {
        modalApi.error({
          title: '检查失败',
          content: '无法获取处理状态，请确认后端服务与网络正常后再试。'
        });
        return;
      }
      if (result.isProcessing) {
        modalApi.info({
          title: '仍在处理中',
          content:
            '暂未从接口匹配到解析完成的记录，请稍后再试，或切换到「预警列表」查看是否已有新预警。' +
            (!isConnected
              ? '\n\n说明：WebSocket 未连接时仅无法接收实时推送，不影响通过本按钮与列表查看结果。'
              : '')
        });
        await fetchWarnings();
        return;
      }
      applyForwardCompletedPollResult(result, forwardFile, { skipProcessingCompletedGuard: true });
    } catch (e) {
      console.error('检查结果失败:', e);
      modalApi.error({
        title: '检查失败',
        content: '获取处理结果时出现异常，请稍后重试。'
      });
    } finally {
      setSearchLoading(false);
    }
  };

  // 预警类型映射
  const getWarningTypeTag = (type: string) => {
    switch (type) {
      case 'upcoming_implementation':
        return <Tag color="orange">即将实施</Tag>;
      case 'obsolete_standard':
        return <Tag color="red">标准作废</Tag>;
      case 'changed_requirement':
        return <Tag color="volcano">要求变更</Tag>;
      default:
        return <Tag color="default">其他</Tag>;
    }
  };

  // 表格列配置
  const warningColumns = [
    {
      title: '类型',
      dataIndex: 'warning_type',
      key: 'warning_type',
      width: 100,
      render: (type: string) => getWarningTypeTag(type)
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: WarningItem) => (
        <div>
          <div><strong>{text}</strong></div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            企业标准: {record.enterprise_bz_id} | 国家标准: {record.national_bz_id}
          </div>
        </div>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => new Date(date).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: WarningItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedWarning(record);
            setModalVisible(true);
          }}
        >
          查看
        </Button>
      )
    }
  ];

  // 清理函数：组件卸载时停止轮询
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
      // 重置处理完成标志
      setProcessingCompleted(false);
    };
  }, [pollingIntervalId]); // 添加 pollingIntervalId 依赖

  // 页面可见性变化时处理轮询
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && pollingIntervalId) {
        // 页面隐藏时停止轮询以节省资源
        clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
      } else if (!document.hidden && !pollingIntervalId && forwardFile && !processingCompleted) {
        // 页面重新可见且之前有轮询需求时，重启轮询（这可能需要额外逻辑）
        // 当前我们只停止轮询，因为状态管理已经足够
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollingIntervalId, forwardFile, processingCompleted]);

  // 初始化加载数据
  useEffect(() => {
    // 初始化处理完成标志
    setProcessingCompleted(false);

    // 加载初始数据
    fetchWarnings();

    // 清理函数：关闭可能存在的 ws 连接
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
  }, []);

  const ensureDifyWsConnected = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const candidates: Array<{ url: string; useToken: boolean }> = [];

    // 如果用户提供了完整 ws Request URL，则优先使用它（不再猜路径）
    const overrideUrl = normalizeWsUrl(wsUrlOverride);
    if (overrideUrl) {
      candidates.push({ url: overrideUrl, useToken: false });
    }

    // 开发态优先走同源 /ws 代理（避免浏览器直连后端端口不可达）
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    candidates.push({ url: `${wsProtocol}//${window.location.host}/ws/dify_results/`, useToken: false });

    // 直连后端（你最早抓到能出 results 的地址）：直连 8000 时通常不需要/不接受 ?token=...
    // 这里强制不拼 token，避免后端拒绝 query token 导致立刻断开。
    candidates.push({ url: `ws://127.0.0.1:8000/ws/dify_results/`, useToken: false });
    candidates.push({ url: `ws://localhost:8000/ws/dify_results/`, useToken: false });

    if (API_BASE_URL && API_BASE_URL.startsWith('http')) {
      try {
        const u = new URL(API_BASE_URL);
        const origin = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
        candidates.push({ url: `${origin}/ws/dify_results/`, useToken: false });
      } catch {
        // ignore
      }
    }

    // 说明：你现在看到的 ws://localhost:5178/?token=... 只会发 ping，不会推 results。
    // 因此这里不再尝试 5178 的 ws，避免建立“只有 ping”的连接却收不到结果。

    const withToken = (c: { url: string; useToken: boolean }) => c.url;

    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        console.warn('WebSocket 连接失败：所有候选地址均不可用', candidates.map(withToken));
        setIsConnected(false);
        return;
      }

      const wsUrl = withToken(candidates[idx++]);
      let ws: WebSocket;
      let opened = false;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        console.warn('WebSocket 创建失败，尝试下一个地址', wsUrl, e);
        tryNext();
        return;
      }
      wsRef.current = ws;

      const openTimer = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try { ws.close(); } catch { /* ignore */ }
        }
      }, 3000);

      ws.onopen = () => {
        window.clearTimeout(openTimer);
        opened = true;
        console.log('WebSocket连接已建立', wsUrl);
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('收到WebSocket消息:', data);
          if (data && typeof data === 'object') {
            if (Array.isArray((data as any).results)) {
              handleDifyResults(data);
              return;
            }
            if ((data as any).type === 'dify_results' && (data as any).data) {
              handleDifyResults((data as any).data);
              return;
            }
            if ((data as any).type === 'dify_notifications' && (data as any).data) {
              handleDifyResults((data as any).data);
              return;
            }
          }
        } catch (error) {
          console.error('解析WebSocket消息失败:', error);
        }
      };

      ws.onclose = () => {
        window.clearTimeout(openTimer);
        // 不能用 readyState 判断是否曾经 open（close 时 readyState 一定是 CLOSED）
        if (!opened) {
          console.warn('WebSocket 未成功建立即关闭，尝试下一个地址', wsUrl);
          tryNext();
        } else {
          console.log('WebSocket连接已关闭');
        }
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        window.clearTimeout(openTimer);
        console.error('WebSocket错误:', error);
      };
    };

    tryNext();
  };

  // 处理WebSocket接收到的DIFY结果
  const handleDifyResults = (resultData: any) => {
    if (forwardCompletionHandledRef.current) {
      return;
    }
    forwardCompletionHandledRef.current = true;
    setProcessingCompleted(true);

    const pid = pollingIntervalRef.current;
    if (pid != null) {
      clearInterval(pid);
      pollingIntervalRef.current = null;
    }
    setPollingIntervalId(null);

    console.log('处理DIFY结果:', resultData);

    // 更新UI显示结果
    let enterpriseStandard =
      forwardFile?.name ||
      resultData.enterprise_standard ||
      resultData.filename ||
      resultData.source_bz_id ||
      '未知文件';
    let publishDate =
      resultData.qibiao_release_date ||
      resultData.publish_date ||
      resultData.create_time ||
      '解析完成';
    let referencedStandards = [];

    // 解析引用标准数据
    if (resultData && typeof resultData === 'object') {
      // 提取引用标准
      if (Array.isArray(resultData.results)) {
        referencedStandards = resultData.results;
      } else if (Array.isArray(resultData.referenced_standards)) {
        referencedStandards = resultData.referenced_standards;
      } else if (Array.isArray(resultData.references)) {
        referencedStandards = resultData.references;
      } else if (Array.isArray(resultData.data?.referenced_standards)) {
        referencedStandards = resultData.data.referenced_standards;
      } else {
        // 如果数据结构不同，尝试其他可能的字段
        for (const key in resultData) {
          if (Array.isArray(resultData[key]) &&
              (key.includes('refer') || key.includes('standard') || key.includes('gb') || key.includes('bz'))) {
            referencedStandards = resultData[key];
            break;
          }
        }
      }
    }

    // 确保引用标准是数组格式
    if (!Array.isArray(referencedStandards)) {
      referencedStandards = [];
    }

    // 过滤掉可能的错误状态值
    referencedStandards = referencedStandards.filter((ref: any) => {
      if (typeof ref === 'object' && ref !== null) {
        // 排除包含API状态信息的对象
        if (ref.code || ref.msg) return false;
      }
      return true;
    });

    const processedData: EnterpriseAnalysisResult[] = [{
      id: 1,
      enterprise_standard: enterpriseStandard,
      publish_date: publishDate,
      referenced_standards: referencedStandards.map((ref: any, idx: number) => {
        let standardizedRef: any = {};

        if (typeof ref === 'string') {
          standardizedRef = { standard_code: ref };
        } else if (typeof ref === 'object' && ref !== null) {
          standardizedRef = ref;
        } else {
          standardizedRef = { standard_code: `未知标准${idx + 1}` };
        }

        return {
          standard_code: standardizedRef.standard_code ||
                        standardizedRef.matched_historical_id ||
                        standardizedRef.original_ref ||
                        standardizedRef.code ||
                        standardizedRef.id ||
                        standardizedRef.name ||
                        `未知标准${idx + 1}`,
          extracted_info: standardizedRef.extracted_info ||
                         standardizedRef.full_text ||
                         standardizedRef.content ||
                         standardizedRef.text ||
                         standardizedRef.description ||
                         '未提取到具体内容',
          matched_trace: standardizedRef.matched_trace ||
                       (standardizedRef.matched_historical_id
                         ? `匹配版本: ${standardizedRef.matched_historical_id}`
                         : '') +
                       (standardizedRef.latest_id
                         ? ` → 最新: ${standardizedRef.latest_id}`
                         : '') ||
                       standardizedRef.trace ||
                       standardizedRef.matched_standard ||
                       standardizedRef.source ||
                       standardizedRef.origin ||
                       '未匹配到具体溯源',
          status: standardizedRef.status ||
                 standardizedRef.state ||
                 (standardizedRef.is_obsolete ? '废止' : '现行'),
          latest_version: standardizedRef.latest_version ||
                         standardizedRef.latest_id ||
                         standardizedRef.new_version ||
                         standardizedRef.latest_standard ||
                         standardizedRef.update_to ||
                         undefined,
          repair_suggestion: standardizedRef.repair_suggestion ||
                            (standardizedRef.is_safe === false && (standardizedRef.latest_id || standardizedRef.latest_version)
                              ? `建议替换为最新标准：${standardizedRef.latest_id || standardizedRef.latest_version}`
                              : undefined) ||
                            standardizedRef.suggestion ||
                            standardizedRef.advice ||
                            standardizedRef.recommendation ||
                            '暂无修复建议'
        };
      })
    }];

    setForwardWarnings(processedData);

    modalApi.success({
      title: '处理完成',
      content: '文件分析结果已接收！'
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 20px 40px',
        background: 'linear-gradient(180deg, #e8f0fe 0%, #f0f5ff 18%, #f5f5f5 45%, #fafafa 100%)'
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Card
          bordered={false}
          style={{
            marginBottom: 20,
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06)',
            overflow: 'hidden'
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div
            style={{
              padding: '22px 24px 20px',
              background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 42%, #faf5ff 100%)',
              borderBottom: '1px solid rgba(22, 119, 255, 0.08)'
            }}
          >
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'linear-gradient(145deg, #1677ff 0%, #4096ff 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 22,
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(22, 119, 255, 0.35)'
                    }}
                  >
                    <BellOutlined />
                  </div>
                  <div>
                    <Title level={3} style={{ margin: '0 0 6px' }}>
                      预警系统
                    </Title>
                    <Text type="secondary" style={{ fontSize: 14 }}>
                      实时监控企业标准与国家标准的合规性变化
                    </Text>
                  </div>
                </div>
              </Col>
              <Col xs={24} lg={10} style={{ textAlign: 'right' }}>
                <Space wrap>
                  {activeTab === 'alert-list' && (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={fetchWarnings}
                      disabled={loading}
                    >
                      刷新
                    </Button>
                  )}
                  <Button
                    type="primary"
                    icon={<AuditOutlined />}
                    onClick={triggerActiveScan}
                  >
                    主动巡检
                  </Button>
                </Space>
              </Col>
            </Row>
          </div>
        </Card>

        {/* 搜索区域 - 分别为反向预警和正向预警 */}
        <Card
          style={{
            marginBottom: 20,
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
          }}
          styles={{ body: { paddingTop: 12, paddingBottom: 24 } }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            tabBarStyle={{
              marginBottom: 16,
              paddingLeft: 4,
              fontWeight: 500
            }}
            items={[
              {
                key: 'reverse-alert',
                label: '反向预警',
                children: (
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        background: '#fff',
                        borderRadius: 20,
                        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
                        padding: '28px 28px 24px',
                        border: '1px solid rgba(15, 23, 42, 0.06)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: 14,
                          alignItems: 'stretch',
                          flexWrap: 'wrap'
                        }}
                      >
                        <Input
                          size="large"
                          placeholder="请输入国标编号，例如：GB/T 9989.3-2015"
                          value={reverseSearchTerm}
                          onChange={(e) => setReverseSearchTerm(e.target.value)}
                          onPressEnter={searchReverseAlert}
                          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                          variant="borderless"
                          style={{
                            flex: '1 1 280px',
                            minHeight: 46,
                            background: '#f0f2f5',
                            borderRadius: 999,
                            paddingLeft: 18,
                            paddingRight: 18,
                            fontSize: 15
                          }}
                        />
                        <Button
                          type="primary"
                          size="large"
                          onClick={searchReverseAlert}
                          loading={searchLoading}
                          style={{
                            flex: '0 1 auto',
                            minWidth: 168,
                            height: 46,
                            fontSize: 15,
                            fontWeight: 600,
                            borderRadius: 999,
                            background: '#0066ff',
                            border: 'none',
                            boxShadow: '0 6px 18px rgba(0, 102, 255, 0.35)'
                          }}
                        >
                          查询关联企标
                        </Button>
                      </div>

                      <div
                        style={{
                          marginTop: 22,
                          background: '#f0f2f5',
                          borderRadius: 16,
                          padding:
                            searchLoading || !reverseAlertDetails ? '40px 24px 36px' : 20,
                          minHeight: 320,
                          boxSizing: 'border-box'
                        }}
                      >
                        {searchLoading ? (
                          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 16, color: '#595959' }}>正在分析预警信息...</div>
                          </div>
                        ) : !reverseAlertDetails ? (
                          <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
                            <ReverseSearchEmptyGraphic />
                            <div
                              style={{
                                fontSize: 17,
                                fontWeight: 700,
                                color: '#262626',
                                marginBottom: 10
                              }}
                            >
                              暂无查询结果
                            </div>
                            <div style={{ fontSize: 14, color: '#8c8c8c', lineHeight: 1.65 }}>
                              请在上方输入准确的国标编号开始检索。系统将自动匹配最新数据库中的关联信息。
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div
                              style={{
                                border: '1px solid #ffd591',
                                background: '#fff7e6',
                                borderRadius: 8,
                                padding: '16px 20px'
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 12
                                }}
                              >
                                <WarningOutlined style={{ fontSize: 22, color: '#d46b08' }} />
                                <Text strong style={{ fontSize: 16, color: '#d46b08' }}>
                                  发现底层引用标准变更
                                </Text>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    您查询的旧版标准
                                  </Text>
                                  <div>
                                    <Text strong>{reverseAlertDetails.oldStandard}</Text>
                                  </div>
                                </div>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    最新替代标准
                                  </Text>
                                  <div>
                                    <Text strong style={{ color: '#722ed1' }}>
                                      {reverseAlertDetails.newStandard}
                                    </Text>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <Text strong style={{ fontSize: 14 }}>
                              受影响企业标准
                            </Text>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                maxHeight: 480,
                                overflowY: 'auto',
                                paddingRight: 4
                              }}
                            >
                              {reverseAlertDetails.affectedEnterprises.length === 0 ? (
                                <Empty
                                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                                  description="暂无关联企业标准"
                                />
                              ) : (
                                reverseAlertDetails.affectedEnterprises.map(
                                  (enterprise_bz: string, index: number) => (
                                    <div
                                      key={index}
                                      style={{
                                        border: '1px solid #bae7ff',
                                        background: '#e6f7ff',
                                        borderRadius: 8,
                                        padding: '14px 16px'
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          marginBottom: 8,
                                          fontSize: 15
                                        }}
                                      >
                                        {enterprise_bz}
                                      </div>
                                      <Text type="secondary" style={{ fontSize: 13 }}>
                                        企业标准 <Text strong>{enterprise_bz}</Text> 引用的国标{' '}
                                        {reverseAlertDetails.oldStandard} 已被最新标准{' '}
                                        {reverseAlertDetails.newStandard} 替代，请及时通知相关方。
                                      </Text>
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 22,
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10
                        }}
                      >
                        <Text style={{ fontSize: 14, color: '#595959', fontWeight: 500 }}>
                          常用操作：
                        </Text>
                        {[
                          {
                            icon: (
                              <CheckCircleOutlined style={{ color: '#0066ff', fontSize: 15 }} />
                            ),
                            label: '支持 GB / GB/T 等编号'
                          },
                          {
                            icon: (
                              <ApartmentOutlined style={{ color: '#0066ff', fontSize: 15 }} />
                            ),
                            label: '企标关联追溯'
                          },
                          {
                            icon: <BulbOutlined style={{ color: '#0066ff', fontSize: 15 }} />,
                            label: '替代标准提示'
                          }
                        ].map((op) => (
                          <div
                            key={op.label}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 16px',
                              background: '#f0f2f5',
                              borderRadius: 999,
                              fontSize: 13,
                              color: '#434343'
                            }}
                          >
                            {op.icon}
                            {op.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              },
              {
                key: 'forward-alert',
                label: '正向预警',
                children: (
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        background: '#fff',
                        borderRadius: 20,
                        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
                        padding: '28px 28px 24px',
                        border: '1px solid rgba(15, 23, 42, 0.06)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: 14,
                          alignItems: 'stretch',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div
                          style={{
                            flex: '1 1 300px',
                            minWidth: 0,
                            borderRadius: 16,
                            overflow: 'hidden',
                            background: '#f0f2f5',
                            border: forwardFile ? '1px solid #c4b5fd' : '1px dashed #d0d7de',
                            boxSizing: 'border-box'
                          }}
                        >
                          {!forwardFile ? (
                            <Dragger
                              name="file"
                              accept=".pdf,.doc,.docx"
                              multiple={false}
                              onChange={handleFileChange}
                              beforeUpload={() => false} // 阻止自动上传
                              style={{
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 16
                              }}
                            >
                              <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                                <UploadOutlined style={{ fontSize: 42, color: '#7c3aed' }} />
                              </p>
                              <p className="ant-upload-text" style={{ fontSize: 15, fontWeight: 500 }}>
                                点击或拖拽文件到此处上传企标文件
                              </p>
                              <p className="ant-upload-hint" style={{ fontSize: 13, padding: '0 12px' }}>
                                支持单个文件上传，格式支持 PDF、Word 等，系统将自动分析文件中的引用标准
                              </p>
                            </Dragger>
                          ) : (
                            <div
                              style={{
                                padding: '22px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                minHeight: 152,
                                boxSizing: 'border-box'
                              }}
                            >
                              <div
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 14,
                                  background: '#ede9fe',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                <FileTextOutlined style={{ fontSize: 28, color: '#7c3aed' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  strong
                                  style={{ fontSize: 15, display: 'block', color: '#262626' }}
                                  ellipsis={{ tooltip: forwardFile.name }}
                                >
                                  {forwardFile.name}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 13, marginTop: 6, display: 'block' }}>
                                  {[formatFileSize(forwardFile.size), getFileExtensionUpper(forwardFile.name)]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                                  已选择文件，可点击「分析预警内容」开始解析
                                </Text>
                              </div>
                              <Button type="link" size="small" onClick={() => setForwardFile(null)} style={{ flexShrink: 0 }}>
                                重新选择
                              </Button>
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            flex: '0 0 auto',
                            minWidth: 168
                          }}
                        >
                          <Button
                            type={forwardFile ? 'primary' : 'default'}
                            size="large"
                            icon={<RocketOutlined />}
                            onClick={searchForwardAlert}
                            loading={searchLoading}
                            disabled={!forwardFile}
                            block
                            style={
                              forwardFile
                                ? {
                                    height: 46,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    border: 'none',
                                    borderRadius: 999,
                                    background:
                                      'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
                                    boxShadow: '0 6px 18px rgba(124, 58, 237, 0.38)'
                                  }
                                : {
                                    height: 46,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    borderRadius: 999
                                  }
                            }
                          >
                            分析预警内容
                          </Button>
                          <Button
                            icon={<ReloadOutlined />}
                            onClick={checkProcessingResult}
                            disabled={searchLoading}
                            block
                            style={{ height: 40, borderRadius: 999 }}
                          >
                            检查结果
                          </Button>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 22,
                          background: '#f0f2f5',
                          borderRadius: 16,
                          padding:
                            searchLoading || forwardWarnings.length === 0
                              ? '40px 24px 36px'
                              : 20,
                          minHeight: 320,
                          boxSizing: 'border-box'
                        }}
                      >
                        {searchLoading ? (
                          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 16, color: '#595959' }}>正在分析企标文件...</div>
                          </div>
                        ) : forwardWarnings.length === 0 ? (
                          <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
                            <ForwardUploadEmptyGraphic />
                            <div
                              style={{
                                fontSize: 17,
                                fontWeight: 700,
                                color: '#262626',
                                marginBottom: 10
                              }}
                            >
                              暂无分析结果
                            </div>
                            <div style={{ fontSize: 14, color: '#8c8c8c', lineHeight: 1.65 }}>
                              请在上方上传企标文件并点击「分析预警内容」。系统将自动解析引用国标并与最新库匹配预警信息。
                            </div>
                          </div>
                        ) : (
                          forwardWarnings.map((record) => (
                            <div key={record.id} style={{ marginTop: 8 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: 12,
                                  marginBottom: 16,
                                  paddingBottom: 12,
                                  borderBottom: '1px solid #e8e8e8'
                                }}
                              >
                                <div>
                                  <Text type="secondary">解析企标</Text>
                                  <Text strong style={{ fontSize: 16, color: '#722ed1', marginLeft: 8 }}>
                                    {record.enterprise_standard}
                                  </Text>
                                  <Text type="secondary" style={{ marginLeft: 16 }}>
                                    发布日期 {record.publish_date}
                                  </Text>
                                </div>
                              </div>
                              {record.referenced_standards && record.referenced_standards.length > 0 ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12,
                                    maxHeight: 520,
                                    overflowY: 'auto',
                                    paddingRight: 4
                                  }}
                                >
                                  {record.referenced_standards.map((ref, index) => {
                                    const theme = getForwardRefCardTheme(ref.status);
                                    const repairFromLatest = ref.latest_version
                                      ? `请将该标准替换为现行/即将实施的最新版 ${ref.latest_version}`
                                      : '';
                                    const repairObsoleteFallback =
                                      !ref.latest_version && ref.status === '废止'
                                        ? '请将该标准替换为现行/即将实施的最新版（暂无最新现行版本）'
                                        : '';
                                    const repairBody =
                                      ref.repair_suggestion && ref.repair_suggestion !== '暂无修复建议'
                                        ? ref.repair_suggestion
                                        : repairFromLatest || repairObsoleteFallback;
                                    const showRepair =
                                      ref.status === '废止' ||
                                      Boolean(ref.latest_version) ||
                                      (ref.repair_suggestion &&
                                        ref.repair_suggestion !== '暂无修复建议');

                                    return (
                                      <div
                                        key={`${record.id}-${index}`}
                                        style={{
                                          background: theme.bg,
                                          border: `1px solid ${theme.border}`,
                                          borderRadius: 8,
                                          padding: '14px 16px'
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: 12
                                          }}
                                        >
                                          <Text strong style={{ fontSize: 15 }}>
                                            {ref.standard_code}
                                          </Text>
                                          {theme.tag}
                                        </div>
                                        <div style={{ marginTop: 10 }}>
                                          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                                            大模型提取：{ref.extracted_info}
                                          </Text>
                                          <Text
                                            type="secondary"
                                            style={{ fontSize: 13, display: 'block', marginTop: 4 }}
                                          >
                                            系统匹配溯源：{ref.matched_trace}
                                          </Text>
                                        </div>
                                        {showRepair && repairBody && (
                                          <div
                                            style={{
                                              marginTop: 12,
                                              padding: '10px 12px',
                                              background: '#fff',
                                              borderRadius: 6,
                                              border: `1px solid ${theme.border}`
                                            }}
                                          >
                                            <Text strong style={{ color: '#cf1322', fontSize: 12 }}>
                                              修复建议
                                            </Text>
                                            <div style={{ marginTop: 6, fontSize: 13, color: '#595959' }}>
                                              {repairBody}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    padding: 20,
                                    background: '#fafafa',
                                    border: '1px solid #d9d9d9',
                                    borderRadius: 8
                                  }}
                                >
                                  <Text type="secondary">暂无引用标准信息</Text>
                                  <div style={{ marginTop: 8, fontSize: 13, color: '#8c8c8c' }}>
                                    文件中未识别到有效的标准引用信息，或该企业标准未引用其他国家标准。
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 22,
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10
                        }}
                      >
                        <Text style={{ fontSize: 14, color: '#595959', fontWeight: 500 }}>
                          常用操作：
                        </Text>
                        {[
                          {
                            icon: (
                              <FileTextOutlined style={{ color: '#7c3aed', fontSize: 15 }} />
                            ),
                            label: '支持 PDF / Word 格式'
                          },
                          {
                            icon: (
                              <ThunderboltOutlined style={{ color: '#7c3aed', fontSize: 15 }} />
                            ),
                            label: '引用标准智能解析'
                          },
                          {
                            icon: (
                              <ApartmentOutlined style={{ color: '#7c3aed', fontSize: 15 }} />
                            ),
                            label: '废止与替代追溯'
                          }
                        ].map((op) => (
                          <div
                            key={op.label}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 16px',
                              background: '#f0f2f5',
                              borderRadius: 999,
                              fontSize: 13,
                              color: '#434343'
                            }}
                          >
                            {op.icon}
                            {op.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              },
              {
                key: 'alert-list',
                label: '预警列表',
                children: (
                  <div>
                    <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                      <Button
                        icon={<AuditOutlined />}
                        onClick={triggerActiveScan}
                      >
                        主动巡检
                      </Button>
                    </div>

                    {loading ? (
                      <div style={{ textAlign: 'center', padding: '48px' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: '16px' }}>正在加载预警信息...</div>
                      </div>
                    ) : (
                      <Table
                        dataSource={warnings}
                        columns={warningColumns}
                        rowKey="id"
                        pagination={{
                          pageSize: 10,
                          showSizeChanger: true,
                          showQuickJumper: true,
                          showTotal: (total) => `共 ${total} 条预警`
                        }}
                        scroll={{ x: 800 }}
                      />
                    )}
                  </div>
                )
              }
            ]}
          />
        </Card>
      </div>

      {/* 通用预警详情模态框 */}
      <Modal
        title={
          <span>
            <WarningOutlined style={{ marginRight: 8, color: '#faad14' }} />
            预警详情
          </span>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedWarning && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ fontSize: '16px' }}>
                {selectedWarning.title}
              </Text>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <Text>
                <strong>企业标准:</strong> {selectedWarning.enterprise_bz_id}<br />
                <strong>关联国家标准:</strong> {selectedWarning.national_bz_id}<br />
                <strong>类型:</strong> {getWarningTypeTag(selectedWarning.warning_type).props.children}<br />
                <strong>创建时间:</strong> {new Date(selectedWarning.created_at).toLocaleString()}<br />
                <strong>更新时间:</strong> {new Date(selectedWarning.updated_at).toLocaleString()}
              </Text>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <Text strong>详细描述:</Text>
              <div style={{ marginTop: '8px', padding: '12px', background: '#fafafa', borderRadius: '4px' }}>
                <Text>{selectedWarning.description}</Text>
              </div>
            </div>
            {selectedWarning.related_standards && selectedWarning.related_standards.length > 0 && (
              <div>
                <Text strong>相关标准:</Text>
                <div style={{ marginTop: '8px' }}>
                  {selectedWarning.related_standards.map((std, index) => (
                    <Tag key={index} color="blue">{std}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      {modalContextHolder}
    </div>
  );
};

export default AlertPage;
