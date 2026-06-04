/** 空状态插图 */

export function ReverseSearchEmptyGraphic() {
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
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
      }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <rect x="18" y="22" width="34" height="44" rx="3" fill="#e2e8f0" opacity="0.9" />
        <circle cx="52" cy="48" r="16" stroke="#0066ff" strokeWidth="3.5" fill="rgba(0,102,255,0.12)" />
        <line x1="63" y1="59" x2="72" y2="68" stroke="#0066ff" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function ForwardSearchEmptyGraphic() {
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
        boxShadow: '0 12px 28px rgba(91, 33, 182, 0.22)',
      }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <path
          d="M28 20h26l12 12v36a4 4 0 01-4 4H28a4 4 0 01-4-4V24a4 4 0 014-4z"
          fill="#faf5ff"
          stroke="#a78bfa"
          strokeWidth="1.8"
        />
        <circle cx="48" cy="62" r="14" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="2.5" />
      </svg>
    </div>
  )
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function getFileExtensionUpper(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toUpperCase()
}
