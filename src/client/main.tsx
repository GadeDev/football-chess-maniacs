import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLocale } from './i18n';
import { installDiagPanelIfRequested } from './debug/diagPanel';

// 実機診断パネル（`?fcmsdebug=1` のときだけ有効。Android Chrome 暗転バグ調査用）。
// AudioContext を包むため、アプリ本体より先に呼ぶ。
installDiagPanelIfRequested();

// 初期ロケール決定: localStorage('fcms.locale') → ブラウザ言語 → フォールバック(ja)
initLocale();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
