import { ArchiveUnifiedListPanel } from './ArchiveUnifiedListPanel'

type PreviewFn = (title: string, payload: unknown, pdfUrl?: string) => void

/** 历史记录 + 下载中心合并为单一表格 */
export function ArchiveAndDownloadsTab({ onPreview }: { onPreview: PreviewFn }) {
  return <ArchiveUnifiedListPanel onPreview={onPreview} />
}
