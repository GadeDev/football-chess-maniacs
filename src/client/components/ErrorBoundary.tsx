// ============================================================
// ErrorBoundary.tsx — ルートのエラー境界
//
// React 19 はエラー境界が無いと、描画中/effect 中の未捕捉例外でルート全体を
// アンマウントする（= body の背景色 #1a1a2e だけの真っ暗な画面になり操作不能）。
// Android Chrome 実機の「KICKOFF 後のタッチで暗転・進行不能」(Issue #13) は
// この状態そのものだった。ここで受け止めて、エラー内容を画面に出す。
//
// i18n には依存しない（クラッシュ画面なので、翻訳層の不具合に巻き込まれない）。
// ============================================================

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

const CRASH_KEY = 'fcms.lastCrash';

function errorToText(error: Error, componentStack: string | null): string {
  const stack = (error.stack ?? '').split('\n').slice(0, 8).join('\n');
  const comp = (componentStack ?? '').split('\n').filter(Boolean).slice(0, 12).join('\n');
  return [
    `FCMS crash ${new Date().toISOString()}`,
    `url: ${typeof location !== 'undefined' ? location.href : '-'}`,
    `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
    `${error.name}: ${error.message}`,
    '--- stack ---',
    stack,
    '--- component stack ---',
    comp,
  ].join('\n');
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const componentStack = info.componentStack ?? null;
    this.setState({ componentStack });
    // 診断パネル（?fcmsdebug=1）と通常の DevTools の両方で拾えるように console にも出す
    console.error('[ErrorBoundary] uncaught render error:', error, componentStack);
    try {
      sessionStorage.setItem(CRASH_KEY, errorToText(error, componentStack));
    } catch {
      // storage が使えなくても無視
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = () => {
    const { error, componentStack } = this.state;
    if (!error) return;
    const text = errorToText(error, componentStack);
    const done = () => { /* no-op */ };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    }
  };

  render(): React.ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const stack = (error.stack ?? '').split('\n').slice(0, 8).join('\n');
    const comp = (componentStack ?? '').split('\n').filter(Boolean).slice(0, 12).join('\n');

    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 100000, overflowY: 'auto',
          background: '#1a1a2e', color: '#fff', padding: '16px 14px',
          fontFamily: 'system-ui, sans-serif', fontSize: 14, lineHeight: 1.5,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffb300', marginBottom: 6 }}>
          エラーが発生しました / An error occurred
        </div>
        <div style={{ fontSize: 12, color: '#ccc', marginBottom: 12 }}>
          この画面のスクショを送ってください。下の「再読み込み」で復帰できます。 / Please screenshot this screen. Tap Reload to recover.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={this.handleReload}
            style={{ padding: '10px 16px', fontSize: 14, fontWeight: 'bold', borderRadius: 8, border: 'none', background: '#44aa44', color: '#fff' }}
          >
            再読み込み / Reload
          </button>
          <button
            onClick={this.handleCopy}
            style={{ padding: '10px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #888', background: 'transparent', color: '#fff' }}
          >
            コピー / Copy
          </button>
        </div>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          <div style={{ color: '#ff8080', fontWeight: 'bold' }}>{error.name}: {error.message}</div>
          <div style={{ color: '#aaa', marginTop: 8 }}>--- stack ---</div>
          <div>{stack}</div>
          <div style={{ color: '#aaa', marginTop: 8 }}>--- component stack ---</div>
          <div>{comp}</div>
        </div>
      </div>
    );
  }
}
