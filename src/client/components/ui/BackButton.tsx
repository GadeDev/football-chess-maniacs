// ============================================================
// BackButton.tsx — 「戻る」ボタン共通コンポーネント（T14）
// 画面下部・中央配置の正本スタイルに統一する
// ============================================================

import React from 'react';
import { t } from '../../i18n';

interface BackButtonProps {
  onClick: () => void;
  /** 省略時は t('common.back') */
  label?: string;
}

export default function BackButton({ onClick, label }: BackButtonProps) {
  return (
    // safe-area-inset-bottom: iPhoneホームインジケータ等と重ならないようにする（Issue #9）
    <div style={{ padding: '12px 0 calc(12px + env(safe-area-inset-bottom))', textAlign: 'center' }}>
      <button
        onClick={onClick}
        style={{
          padding: '8px 24px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: '#888',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        {label ?? t('common.back')}
      </button>
    </div>
  );
}
