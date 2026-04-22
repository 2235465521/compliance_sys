import type {
  ArchiveHistoryQuery,
  ArchiveHistoryRecord,
  DownloadCenterItem,
  DownloadListQuery,
  TemplateConfigItem,
  TemplateListQuery,
} from '@/types/template-archive'
import { downloadByUrl } from '@/utils/download'

/**
 * 模板与存档（成员三）
 *
 * 当前版本：后端尚未提供模板/存档/下载中心的专用 API，因此此模块保持「纯前端占位」：
 * - 列表：展示本地 mock
 * - 上传/启停/删除：由 store 在内存里模拟
 * - 下载/批量下载：若无 url 则提示后端未接入
 */

function nowIso() {
  return new Date().toISOString()
}

export function mockTemplates(): TemplateConfigItem[] {
  return [
    {
      id: 'tpl-1',
      name: '查重报告模板（示例）',
      type: 'docx',
      version: 'v1.0',
      updatedAt: nowIso(),
      status: 'active',
      desc: '用于查重服务导出报告。',
      placeholders: ['standardName', 'similarity', 'conclusion'],
      relatedModules: ['duplicate-check'],
    },
    {
      id: 'tpl-2',
      name: '下载中心清单（示例）',
      type: 'xlsx',
      version: 'v1.0',
      updatedAt: nowIso(),
      status: 'disabled',
      desc: '批量导出清单样式。',
      placeholders: ['fileName', 'createdAt'],
      relatedModules: ['duplicate-check', 'novelty-search'],
    },
  ]
}

export function mockArchiveRecords(): ArchiveHistoryRecord[] {
  return [
    {
      id: 'rec-1',
      name: '查重任务 #10086',
      module: 'duplicate-check',
      enterprise: '示例企业 A',
      operatorName: '管理员',
      taskType: 'duplicate-check',
      createdAt: nowIso(),
      status: 'success',
      reportId: 'rep-10086',
    },
    {
      id: 'rec-2',
      name: '查重任务 #10087',
      module: 'duplicate-check',
      enterprise: '示例企业 B',
      operatorName: '张三',
      taskType: 'duplicate-check',
      createdAt: nowIso(),
      status: 'running',
    },
  ]
}

export function mockDownloads(): DownloadCenterItem[] {
  return [
    {
      id: 'dl-1',
      fileName: '查重报告_10086.pdf',
      fileType: 'report',
      sizeText: '1.2 MB',
      createdAt: nowIso(),
      status: 'ready',
      url: '',
      mimeType: 'application/pdf',
    },
    {
      id: 'dl-2',
      fileName: '模板_查重报告_v1.0.docx',
      fileType: 'template',
      sizeText: '240 KB',
      createdAt: nowIso(),
      status: 'processing',
    },
  ]
}

export async function fetchTemplates(params?: TemplateListQuery) {
  const kw = params?.keyword?.trim()
  const list = mockTemplates()
  if (!kw) return list
  return list.filter((t) => t.name.includes(kw) || t.id.includes(kw))
}

export async function fetchArchiveRecords(params?: ArchiveHistoryQuery) {
  const kw = params?.keyword?.trim()
  const list = mockArchiveRecords()
  if (!kw) return list
  return list.filter((r) => r.name.includes(kw) || r.id.includes(kw))
}

export async function fetchDownloads(params?: DownloadListQuery) {
  const kw = params?.keyword?.trim()
  const list = mockDownloads()
  if (!kw) return list
  return list.filter((d) => d.fileName.includes(kw) || d.id.includes(kw))
}

export async function uploadTemplateFile(
  file: File,
  fileName: string,
  extra?: { placeholders?: string[]; relatedModules?: string[]; desc?: string },
) {
  void file
  void fileName
  void extra
  throw new Error('模板与存档：后端尚未接入上传接口。')
}

export async function updateTemplateStatus(id: string, status: 'active' | 'disabled') {
  void id
  void status
  throw new Error('模板与存档：后端尚未接入状态更新接口。')
}

export async function deleteTemplate(id: string) {
  void id
  throw new Error('模板与存档：后端尚未接入删除接口。')
}

/** 单项下载：优先 url，否则按 id 请求 blob */
export async function downloadArchiveItem(item: DownloadCenterItem): Promise<void> {
  if (item.url?.trim()) {
    downloadByUrl(item.url.trim())
    return
  }
  // 本地占位：避免误导用户下载到 404/JSON；明确提示后端未接入
  throw new Error('下载中心尚未接入后端：该条目没有可用的下载地址。')
}

/** 批量打包下载 */
export async function batchDownloadArchive(ids: string[]) {
  void ids
  throw new Error('批量打包下载尚未接入后端。')
}
