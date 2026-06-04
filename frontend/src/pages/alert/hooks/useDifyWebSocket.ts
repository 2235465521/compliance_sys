import { useCallback, useEffect, useRef, useState } from 'react'

function normalizeWsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s)
  } catch {
    /* ignore */
  }
  if (s.startsWith('ws://') || s.startsWith('wss://')) return s
  return null
}

function extractRefsFromPayload(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data.results)) return data.results
  if (Array.isArray(data.referenced_standards)) return data.referenced_standards
  if (Array.isArray(data.references)) return data.references
  const nested = data.data
  if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).referenced_standards)) {
    return (nested as Record<string, unknown>).referenced_standards as unknown[]
  }
  for (const key of Object.keys(data)) {
    if (
      Array.isArray(data[key]) &&
      (key.includes('refer') || key.includes('standard') || key.includes('gb') || key.includes('bz'))
    ) {
      return data[key] as unknown[]
    }
  }
  return []
}

export function useDifyWebSocket(onResults: (refs: unknown[], meta: Record<string, unknown>) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const onResultsRef = useRef(onResults)
  onResultsRef.current = onResults
  const [isConnected, setIsConnected] = useState(false)

  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api'

  const ensureConnected = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const candidates: string[] = []
    try {
      const override = normalizeWsUrl(window.sessionStorage.getItem('ws_url'))
      if (override) candidates.push(override)
    } catch {
      /* ignore */
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    candidates.push(`${wsProtocol}//${window.location.host}/ws/dify_results/`)

    if (apiBase.startsWith('http')) {
      try {
        const u = new URL(apiBase)
        const origin = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`
        candidates.push(`${origin}/ws/dify_results/`)
      } catch {
        /* ignore */
      }
    }

    let idx = 0
    const tryNext = () => {
      if (idx >= candidates.length) {
        setIsConnected(false)
        return
      }
      const wsUrl = candidates[idx++]
      let ws: WebSocket
      let opened = false
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        tryNext()
        return
      }
      wsRef.current = ws

      const openTimer = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
        }
      }, 3000)

      ws.onopen = () => {
        window.clearTimeout(openTimer)
        opened = true
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          let payload: Record<string, unknown> | null = null
          if (Array.isArray(data.results)) payload = data
          else if (data.type === 'dify_results' && data.data && typeof data.data === 'object') {
            payload = data.data as Record<string, unknown>
          } else if (data.type === 'dify_notifications' && data.data && typeof data.data === 'object') {
            payload = data.data as Record<string, unknown>
          } else if (typeof data === 'object') payload = data

          if (payload) {
            const refs = extractRefsFromPayload(payload)
            if (refs.length > 0) onResultsRef.current(refs, payload)
          }
        } catch {
          /* ignore parse errors */
        }
      }

      ws.onclose = () => {
        window.clearTimeout(openTimer)
        if (!opened) tryNext()
        setIsConnected(false)
      }

      ws.onerror = () => {
        window.clearTimeout(openTimer)
      }
    }

    tryNext()
  }, [apiBase])

  useEffect(() => {
    return () => {
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      }
    }
  }, [])

  return { isConnected, ensureConnected }
}
