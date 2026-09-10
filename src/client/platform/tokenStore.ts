// ============================================================
// tokenStore.ts — Platform JWT の永続化
// localStorage namespace: 既存のuf_ssoフラグメント実装(App.tsx)が使っていた
// fcms_token / fcms_refresh_token キーをそのまま引き継ぐ（後方互換）。
// GrassrootsFootball (threejs-client/src/auth/tokenStore.js) と同一パターン。
// ============================================================

const KEY_ACCESS = 'fcms_token';
const KEY_REFRESH = 'fcms_refresh_token';
const KEY_USER_ID = 'fcms_user_id';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** アクセストークン + リフレッシュトークンを保存。JWT の sub をユーザーID表示用にキャッシュする */
export function saveTokens(accessToken: string, refreshToken?: string): void {
  try {
    localStorage.setItem(KEY_ACCESS, accessToken);
    if (refreshToken) {
      localStorage.setItem(KEY_REFRESH, refreshToken);
    } else {
      localStorage.removeItem(KEY_REFRESH);
    }

    const payload = decodeJwtPayload(accessToken);
    const sub = payload?.sub;
    if (typeof sub === 'string' && sub.length > 0) {
      localStorage.setItem(KEY_USER_ID, sub);
    } else {
      localStorage.removeItem(KEY_USER_ID);
    }
  } catch {
    // Storage unavailable; token stays valid for this session via React state only.
  }
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(KEY_ACCESS);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(KEY_REFRESH);
  } catch {
    return null;
  }
}

/** JWT sub から復元したユーザーID（表示用。認証判断には使わない） */
export function getUserId(): string | null {
  try {
    return localStorage.getItem(KEY_USER_ID);
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(KEY_ACCESS);
    localStorage.removeItem(KEY_REFRESH);
    localStorage.removeItem(KEY_USER_ID);
  } catch {
    // ignore
  }
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

/**
 * 保存中のアクセストークンの JWT `exp`（秒）をミリ秒に変換して返す。
 * トークン無し・デコード不能・`exp` 無しは null。
 */
export function getAccessTokenExpiresAt(): number | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/**
 * アクセストークンが withinMs 以内に失効する（もしくは既に失効している）か。
 * `exp` が取れない場合は false を返す（従来挙動を維持し、判定不能を失効扱いにしない）。
 */
export function isAccessTokenExpiring(withinMs = 60_000): boolean {
  const expiresAt = getAccessTokenExpiresAt();
  return expiresAt !== null && expiresAt - Date.now() <= withinMs;
}

export function hasRefreshToken(): boolean {
  return !!getRefreshToken();
}
