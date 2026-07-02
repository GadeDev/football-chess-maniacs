// ============================================================
// useWebSocket.ts — WebSocket通信フック（§3-1, §7-2）
// ============================================================

import { useRef, useCallback, useEffect, useState } from 'react';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  /** WebSocket接続先URL */
  url: string;
  /** JWTトークン */
  token: string;
  /** メッセージ受信ハンドラ */
  onMessage: (msg: WsMessage) => void;
  /** 切断ハンドラ */
  onDisconnect?: () => void;
  /** 再接続ハンドラ */
  onReconnect?: () => void;
  /** 自動再接続を有効にするか */
  autoReconnect?: boolean;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export function useWebSocket(options: UseWebSocketOptions) {
  const { url, token, onMessage, onDisconnect, onReconnect, autoReconnect = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected' as ConnectionStatus);

  // ハンドラは最新をrefで保持し、connect の useCallback 依存から外す。
  // 呼び出し元がinline関数を渡すと connect の identity が毎レンダー変わり、
  // 呼び出し元の useEffect（deps: [wsConnect]）が「切断→再接続」を無限ループしていた
  // （オンラインE2E検証で発見: WSが永遠に'connecting'のまま + /api/teams への429ストーム）
  const onMessageRef = useRef(onMessage);
  const onDisconnectRef = useRef(onDisconnect);
  const onReconnectRef = useRef(onReconnect);
  onMessageRef.current = onMessage;
  onDisconnectRef.current = onDisconnect;
  onReconnectRef.current = onReconnect;

  const connect = useCallback(() => {
    // OPEN または CONNECTING 中は重複接続を防止
    const rs = wsRef.current?.readyState;
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;

    // §7-2: URLクエリパラメータにトークンを含める
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('connecting');

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      setStatus('connected');
      if (reconnectCountRef.current > 0) {
        onReconnectRef.current?.();
      }
      reconnectCountRef.current = 0;

      // Ping送信（10秒間隔）
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 10_000);
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      setStatus('disconnected');
      onDisconnectRef.current?.();

      if (autoReconnect && reconnectCountRef.current < 5) {
        const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 10_000);
        reconnectCountRef.current++;
        setStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessageRef.current(msg);
      } catch {
        // 不正なJSONは無視
      }
    };
  }, [url, token, autoReconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectCountRef.current = 999; // 再接続防止
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const send = useCallback((data: unknown): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    // 再接続中などOPENでない間は送信されない。呼び出し元が再試行を判断できるように成否を返す
    console.warn('[useWebSocket] send dropped: socket not open');
    return false;
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return { connect, disconnect, send, status };
}
