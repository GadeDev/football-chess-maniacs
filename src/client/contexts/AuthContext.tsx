// ============================================================
// AuthContext.tsx — Platform ログイン状態の単一窓口（client側）
// GrassrootsFootball (threejs-client/src/auth/authState.js) と同じ役割。
// requireLogin(reason) を呼ぶと LoginModal が開き、成功後は呼び出し元に戻る。
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  getAccessToken,
  getUserId,
  getAccessTokenExpiresAt,
  isAccessTokenExpiring,
  hasRefreshToken,
  clearTokens,
} from '../platform/tokenStore';
import { onAuthChange, logout as authClientLogout, refresh as authClientRefresh } from '../platform/authClient';
import { consumeUniversoSsoFromHash } from '../platform/ssoFragment';
import LoginModal from '../components/auth/LoginModal';

interface AuthContextValue {
  isLoggedIn: boolean;
  userId: string | null;
  /** Bearer token。既存画面へのprop threading用（authToken propの置き換え元） */
  accessToken: string | null;
  /** ログインが必要な操作を試みた時に呼ぶ。ログインモーダルを開く */
  requireLogin: (reason?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isLoggedIn: false,
  userId: null,
  accessToken: null,
  requireLogin: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);

  const syncFromStore = useCallback(() => {
    setAccessToken(getAccessToken());
    setUserId(getUserId());
  }, []);

  useEffect(() => {
    // Universo Futbol からの #uf_sso= フラグメントを最初に消費してから状態を同期する
    consumeUniversoSsoFromHash();
    syncFromStore();

    // 失効済みトークンで起動した場合の後始末（Issue #36）。
    // refresh token があれば復帰を試み（結果は onAuthChange 経由で反映されるので await しない）、
    // 無ければゲストに落とす。
    if (getAccessToken() && isAccessTokenExpiring(0)) {
      if (hasRefreshToken()) {
        void authClientRefresh();
      } else {
        clearTokens();
        syncFromStore();
      }
    }

    return onAuthChange(() => syncFromStore());
  }, [syncFromStore]);

  // 失効60秒前に自動refreshする。refresh成功 → onAuthChange → accessToken更新 →
  // このeffect再実行、で周回する。StrictModeの二重実行はクリーンアップで解消する
  // （ref ガードは使わない）。
  useEffect(() => {
    if (!accessToken) return;
    const expiresAt = getAccessTokenExpiresAt();
    if (expiresAt === null) return;

    const delay = Math.max(5_000, expiresAt - Date.now() - 60_000);
    const timer = setTimeout(() => { void authClientRefresh(); }, delay);
    return () => clearTimeout(timer);
  }, [accessToken]);

  const requireLogin = useCallback((r?: string) => {
    setReason(r);
    setModalOpen(true);
  }, []);

  const logout = useCallback(() => {
    authClientLogout();
    syncFromStore();
  }, [syncFromStore]);

  const handleModalSuccess = useCallback(() => {
    setModalOpen(false);
    syncFromStore();
  }, [syncFromStore]);

  const value: AuthContextValue = {
    // 文字列が残っているだけでは「ログイン中」にしない。失効していても
    // refresh token があれば復帰できるのでログイン中として扱う（Issue #36）。
    isLoggedIn: !!accessToken && (!isAccessTokenExpiring(0) || hasRefreshToken()),
    userId,
    accessToken,
    requireLogin,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modalOpen && (
        <LoginModal
          reason={reason}
          onClose={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
