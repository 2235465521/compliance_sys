import { message } from 'antd'
import { create } from 'zustand'
import type {
  ArchiveHistoryQuery,
  ArchiveHistoryRecord,
  DownloadCenterItem,
  DownloadListQuery,
  TemplateConfigItem,
  TemplateFileType,
  TemplateListQuery,
  TemplateRelatedModule,
} from '@/types/template-archive'
import {
  batchDownloadArchive,
  deleteTemplate,
  fetchArchiveRecords,
  fetchDownloads,
  fetchTemplates,
  mockArchiveRecords,
  mockDownloads,
  mockTemplates,
  updateTemplateStatus,
  uploadTemplateFile,
} from '@/services/template-archive'

interface TemplateArchiveStore {
  templates: TemplateConfigItem[]
  records: ArchiveHistoryRecord[]
  downloads: DownloadCenterItem[]
  templatesLoading: boolean
  recordsLoading: boolean
  downloadsLoading: boolean
  batchDownloading: boolean

  fetchTemplates: (q?: TemplateListQuery) => Promise<void>
  fetchRecords: (q?: ArchiveHistoryQuery) => Promise<void>
  fetchDownloads: (q?: DownloadListQuery) => Promise<void>

  uploadTemplate: (
    file: File,
    fileName: string,
    extra?: { placeholders?: string[]; relatedModules?: string[]; desc?: string },
  ) => Promise<'api' | 'local' | 'error'>

  setTemplateStatus: (id: string, status: 'active' | 'disabled') => Promise<void>
  removeTemplate: (id: string) => Promise<void>

  prependLocalTemplate: (item: TemplateConfigItem) => void
  setTemplates: (items: TemplateConfigItem[]) => void

  batchDownload: (ids: string[]) => Promise<void>
}

export const useTemplateArchiveStore = create<TemplateArchiveStore>((set, get) => ({
  templates: [],
  records: [],
  downloads: [],
  templatesLoading: false,
  recordsLoading: false,
  downloadsLoading: false,
  batchDownloading: false,

  setTemplates: (items) => set({ templates: items }),

  prependLocalTemplate: (item) =>
    set((s) => ({ templates: [item, ...s.templates] })),

  fetchTemplates: async (q) => {
    set({ templatesLoading: true })
    try {
      const list = await fetchTemplates(q)
      set({ templates: list, templatesLoading: false })
    } catch (err) {
      void err
      set({ templates: mockTemplates(), templatesLoading: false })
    }
  },

  fetchRecords: async (q) => {
    set({ recordsLoading: true })
    try {
      const list = await fetchArchiveRecords(q)
      set({ records: list, recordsLoading: false })
    } catch (err) {
      void err
      set({ records: mockArchiveRecords(), recordsLoading: false })
    }
  },

  fetchDownloads: async (q) => {
    set({ downloadsLoading: true })
    try {
      const list = await fetchDownloads(q)
      set({ downloads: list, downloadsLoading: false })
    } catch (err) {
      void err
      set({ downloads: mockDownloads(), downloadsLoading: false })
    }
  },

  uploadTemplate: async (file, fileName, extra) => {
    const inferType = (name: string): TemplateFileType => {
      const n = name.toLowerCase()
      if (n.endsWith('.docx')) return 'docx'
      if (n.endsWith('.xlsx')) return 'xlsx'
      if (n.endsWith('.pdf')) return 'pdf'
      return 'other'
    }

    try {
      await uploadTemplateFile(file, fileName, extra)
      await get().fetchTemplates()
      return 'api'
    } catch (err) {
      void err
      message.info('模板与存档后端尚未接入：已仅在本地临时新增一条记录（刷新后丢失）。', 5)
      const related = (extra?.relatedModules || []) as TemplateRelatedModule[]
      get().prependLocalTemplate({
        id: `local-${Date.now()}`,
        name: fileName,
        type: inferType(fileName),
        version: 'v0.1',
        updatedAt: new Date().toISOString(),
        status: 'active',
        desc:
          extra?.desc ||
          '本地占位：后端尚未接入时仅保存在浏览器内存（刷新后丢失）。',
        placeholders: extra?.placeholders,
        relatedModules: related.length ? related : ['duplicate-check'],
      })
      return 'local'
    }
  },

  setTemplateStatus: async (id, status) => {
    try {
      await updateTemplateStatus(id, status)
      await get().fetchTemplates()
    } catch (err) {
      void err
      set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? { ...t, status } : t)),
      }))
    }
  },

  removeTemplate: async (id) => {
    try {
      await deleteTemplate(id)
      await get().fetchTemplates()
    } catch (err) {
      void err
      set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
    }
  },

  batchDownload: async (ids) => {
    if (!ids.length) return
    set({ batchDownloading: true })
    try {
      await batchDownloadArchive(ids)
    } catch (err) {
      message.info(err instanceof Error ? err.message : '批量打包下载尚未接入后端。', 5)
    } finally {
      set({ batchDownloading: false })
    }
  },
}))
