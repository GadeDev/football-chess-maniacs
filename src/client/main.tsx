import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLocale } from './i18n';
import { installDiagPanelIfRequested } from './debug/diagPanel';
import ErrorBoundary from './components/ErrorBoundary';

// 実機診断パネル（`?fcmsdebug=1` のときだけ有効。Android Chrome 暗転バグ調査用）。
// AudioContext を包むため、アプリ本体より先に呼ぶ。
installDiagPanelIfRequested();

// 初期ロケール決定: localStorage('fcms.locale') → ブラウザ言語 → フォールバック(ja)
initLocale();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ルートのエラー境界: 未捕捉の描画例外で画面全体が消える（Issue #13 の暗転）代わりにエラー内容を表示する */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
