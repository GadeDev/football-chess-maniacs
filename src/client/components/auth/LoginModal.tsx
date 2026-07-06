// ============================================================
// LoginModal.tsx — Platformログイン/新規登録モーダル
// GrassrootsFootball (threejs-client/src/auth/authUI.js) と同じUX:
// メール+パスワードでPlatform APIに直接ログイン/登録し、ゲスト続行もできる。
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { login, loginWithGoogle, register } from '../../platform/authClient';
import { getGoogleClientId } from '../../platform/config';
import { getLocale, t, type Locale } from '../../i18n';
import { LEGAL_TERMS_APPLICABILITY } from '../LegalFooter';

interface LoginModalProps {
  /** requireLogin(reason) で渡された理由（未ログインで踏んだ機能名など） */
  reason?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = 'login' | 'register';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

const PLATFORM_LOCALE: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  ko: 'ko-KR',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  'zh-CN': 'zh-CN',
};

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('google_script_error')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('google_script_error'));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

function GoogleSignInButton({
  disabled,
  onCredential,
  onUnavailable,
}: {
  disabled: boolean;
  onCredential: (credential: string) => void;
  onUnavailable: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
        containerRef.current.textContent = '';
        window.google.accounts.id.initialize({
          client_id: getGoogleClientId(),
          callback: (response) => {
            if (response.credential) onCredential(response.credential);
            else onUnavailable();
          },
          ux_mode: 'popup',
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: Math.min(300, containerRef.current.clientWidth || 300),
        });
      } catch {
        if (!cancelled) onUnavailable();
      }
    };
    void render();
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.textContent = '';
    };
  }, [onCredential, onUnavailable]);

  return <div ref={containerRef} style={{ ...googleSlotStyle, pointerEvents: disabled ? 'none' : undefined, opacity: disabled ? 0.55 : 1 }} />;
}

export default function LoginModal({ reason, onClose, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError(t('auth.email_required'));
      return;
    }
    if (!password) {
      setError(t('auth.password_required'));
      return;
    }
    if (mode === 'register' && password !== passwordConfirm) {
      setError(t('auth.passwords_mismatch'));
      return;
    }

    setError('');
    setSubmitting(true);
    const result = mode === 'register'
      ? await register(trimmedEmail, password)
      : await login(trimmedEmail, password);
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error || t(mode === 'register' ? 'auth.register_failed' : 'auth.login_failed'));
    }
  }, [email, password, passwordConfirm, mode, onSuccess]);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const result = await loginWithGoogle(credential, PLATFORM_LOCALE[getLocale()]);
    setSubmitting(false);

    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error || t('auth.google_failed'));
    }
  }, [submitting, onSuccess]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 340, borderRadius: 16, padding: '28px 24px',
        background: '#12122b', border: '1px solid rgba(255,214,0,0.3)',
        boxShadow: '0 0 30px rgba(255,214,0,0.12), 0 8px 24px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>
            {t(mode === 'register' ? 'auth.register_title' : 'auth.login_title')}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {reason && (
          <div style={{ fontSize: 12, color: '#cc8800', background: 'rgba(255,214,0,0.08)', borderRadius: 8, padding: '8px 10px' }}>
            {t('auth.reason_prefix', { reason })}
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('auth.email')}
          autoComplete="email"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('auth.password')}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          style={inputStyle}
        />
        {mode === 'register' && (
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder={t('auth.password_confirm')}
            autoComplete="new-password"
            style={inputStyle}
          />
        )}

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, textAlign: 'center' }}>{error}</div>}

        <div style={termsNoticeStyle}>{LEGAL_TERMS_APPLICABILITY}</div>

        <GoogleSignInButton
          disabled={submitting}
          onCredential={(credential) => { void handleGoogleCredential(credential); }}
          onUnavailable={() => setError(t('auth.google_unavailable'))}
        />

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '13px 0', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #ffd700, #ffb300)',
            color: '#000', fontSize: 15, fontWeight: 900,
            cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '...' : t(mode === 'register' ? 'auth.register_button' : 'auth.login_button')}
        </button>

        <button
          onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}
          style={{ background: 'none', border: 'none', color: '#8cf', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {t(mode === 'register' ? 'auth.switch_to_login' : 'auth.switch_to_register')}
        </button>

        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}
        >
          {t('auth.guest_continue')}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 14, borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)', background: '#0a0a1e',
  color: '#fff', outline: 'none',
};

const termsNoticeStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.58)',
  fontSize: 10,
  lineHeight: 1.5,
  textAlign: 'center',
};

const googleSlotStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  width: '100%',
  minHeight: 44,
};
