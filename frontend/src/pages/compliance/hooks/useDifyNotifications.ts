import { useEffect, useRef } from 'react'

const WS_DISABLED =
  (import.meta.env.VITE_WS_DIFY_ENABLED as string | undefined)?.toLowerCase() === 'false'

const MAX_RECONNECT_ATTEMPTS = 10

/**
 * 解析 `dify_notifications` WebSocket 地址。
 * 优先 `VITE_WS_DIFY_URL`；否则由 `VITE_API_BASE_URL` 推导（去掉 /api，追加 /ws/dify_notifications/）。
 */
export function resolveDifyWebSocketUrl(): string | null {
  const explicit = (import.meta.env.VITE_WS_DIFY_URL as string | undefined)?.trim()
  if (explicit) {
    return explicit
  }

  const api = (import.meta.env.VITE_API_BASE_URL || '') as string
  if (!api || api.startsWith('/')) {
    return null
  }

  try {
    const normalized = api.replace(/\/+$/, '')
    const hasScheme = /^https?:\/\//i.test(normalized)
    const u = new URL(hasScheme ? normalized : `http://${normalized}`)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    let basePath = u.pathname.replace(/\/?api\/?$/i, '') || ''
    if (basePath.endsWith('/')) {
      basePath = basePath.slice(0, -1)
    }
    return `${wsProto}//${u.host}${basePath}/ws/dify_notifications/`
  } catch {
    return null
  }
}

type UseDifyNotificationsOptions = {
  enabled?: boolean
  onEvent: (payload: unknown) => void
}

/**
 * 连接后端 Channels 房间 `dify_notifications`，用于 Celery+Dify 异步解析结果推送。
 * 断线后指数退避重连（有上限）；卸载时不再重连。
 *
 * 说明：
 * - 开发环境下 React 18 Strict Mode 会双重挂载，可能在 WebSocket 仍处于 CONNECTING 时执行 cleanup，
 *   浏览器会报 “closed before the connection is established”，属正常现象，第二次挂载会再连。
 * - 若路径与后端 routing 不一致，会反复失败；请设置 `VITE_WS_DIFY_URL` 或 `VITE_WS_DIFY_ENABLED=false` 先关闭实时推送（页面仍可用轮询）。
 */
export function useDifyNotifications({ enabled = true, onEvent }: UseDifyNotificationsOptions) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled || WS_DISABLED) {
      return
    }

    const url = resolveDifyWebSocketUrl()
    if (!url) {
      console.warn(
        '[compliance] 未配置 WebSocket：请设置 VITE_WS_DIFY_URL，或确保 VITE_API_BASE_URL 为完整 URL 以便推导；也可设置 VITE_WS_DIFY_ENABLED=false 仅用轮询。',
      )
      return
    }

    let stopped = false
    let shouldReconnect = true
    let ws: WebSocket | null = null
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let initialDelayTimer: ReturnType<typeof setTimeout> | undefined
    let gaveUpLogged = false

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }

    const connect = () => {
      if (stopped || !shouldReconnect) {
        return
      }

      if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
        if (!gaveUpLogged) {
          gaveUpLogged = true
          console.warn(
            `[compliance] WebSocket 已连续失败 ${MAX_RECONNECT_ATTEMPTS} 次，已停止重连。请核对后端 Channels 路径是否与 ${url} 一致，或在 .env 中设置 VITE_WS_DIFY_ENABLED=false 关闭推送（依赖轮询即可）。`,
          )
        }
        return
      }

      try {
        ws = new WebSocket(url)
      } catch (e) {
        console.warn('[compliance] WebSocket 创建失败:', e)
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        reconnectAttempt = 0
        gaveUpLogged = false
      }

      ws.onmessage = (event) => {
        let payload: unknown = event.data
        if (typeof event.data === 'string') {
          try {
            payload = JSON.parse(event.data) as unknown
          } catch {
            payload = event.data
          }
        }
        onEventRef.current(payload)
      }

      ws.onerror = () => {
        // 不主动 close，交给浏览器走 onclose，避免与 cleanup 中的 close 竞态
      }

      ws.onclose = () => {
        ws = null
        if (stopped || !shouldReconnect) {
          return
        }
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      clearReconnectTimer()
      reconnectAttempt += 1
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 8))
      reconnectTimer = setTimeout(connect, delay)
    }

    // 略微推迟首次连接，减轻 Strict Mode 下「刚连上就被 cleanup 关掉」时的浏览器告警
    initialDelayTimer = setTimeout(connect, 100)

    return () => {
      stopped = true
      shouldReconnect = false
      clearReconnectTimer()
      if (initialDelayTimer) {
        clearTimeout(initialDelayTimer)
      }
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
        ws = null
      }
    }
  }, [enabled])
}
