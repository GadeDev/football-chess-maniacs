import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLocale } from './i18n';

// 初期ロケール決定: localStorage('fcms.locale') → ブラウザ言語 → フォールバック(ja)
initLocale();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
