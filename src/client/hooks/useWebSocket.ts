// ============================================================
// useWebSocket.ts — WebSocket通信フック（§3-1, §7-2）
// ============================================================

import { useRef, useCallback, useEffect, useState } from 'react';
import type { WsMessage } from '../types';
import { ensureFreshAccessToken } from '../platform/authClient';

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

/** Platform JWT かどうか（COMセッション/自己対戦席のトークンはUUIDなので3セグメントにならない） */
function isJwtShaped(token: string): boolean {
  return token.split('.').length === 3;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { url, token, onMessage, onDisconnect, onReconnect, autoReconnect = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  // connect のシーケンス番号。await 明けに自分が最新の接続要求か照合する
  const connectSeqRef = useRef(0);
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

    // 同一アカウントでフレンド対戦を2タブ検証する場合、参加側タブだけに
    // sessionStorageでAway席専用トークンが保存される。通常対戦/ホスト側はJWTを使う。
    let connectionToken = token;
    try {
      const match = url.match(/\/match\/([^/?]+)\/ws$/);
      const matchId = match?.[1];
      if (matchId && typeof sessionStorage !== 'undefined') {
        const friendSeatToken = sessionStorage.getItem(`fcms_friend_ws_token:${matchId}`);
        if (friendSeatToken) connectionToken = friendSeatToken;
      }
    } catch {
      // sessionStorage が利用できない環境では通常トークンへフォールバック
    }

    // トークン鮮度の確保は接続直前のここ1箇所で行う。closure が握る古いJWTのまま
    // 再接続すると、サーバーの「残存60秒以上」要件で401になる（Issue #36）。
    // COMセッション/自己対戦席のUUIDトークンは refresh 対象外なのでそのまま使う。
    const seq = ++connectSeqRef.current;
    void (async () => {
      if (isJwtShaped(connectionToken)) {
        const fresh = await ensureFreshAccessToken();
        if (fresh) connectionToken = fresh;
      }
      // await 中に disconnect / 別の connect が走っていたら接続しない
      if (seq !== connectSeqRef.current) return;
      const rsNow = wsRef.current?.readyState;
      if (rsNow === WebSocket.OPEN || rsNow === WebSocket.CONNECTING) return;
      openSocket(connectionToken);
    })();

    function openSocket(activeToken: string) {
      // §7-2: URLクエリパラメータにトークンを含める
      const separator = url.includes('?') ? '&' : '?';
      const wsUrl = `${url}${separator}token=${encodeURIComponent(activeToken)}`;
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
    }
  }, [url, token, autoReconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectCountRef.current = 999; // 再接続防止
    connectSeqRef.current++; // 進行中のconnect（トークン取得のawait中）を無効化
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
