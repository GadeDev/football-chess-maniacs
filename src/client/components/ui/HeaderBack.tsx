// ============================================================
// HeaderBack.tsx — 画面左上の「←」戻るボタン（Issue #9）
// 画面下部のBackButtonを補完する発見性の高い戻る導線。
// フル画面のスクリーン（コレクション/ショップ/ランキング/プロフィール/設定）で使用。
// ============================================================

import React from 'react';
import { t } from '../../i18n';

interface HeaderBackProps {
  onClick: () => void;
}

export default function HeaderBack({ onClick }: HeaderBackProps) {
  return (
    <button
      aria-label={t('common.back')}
      onClick={onClick}
      style={{
        position: 'fixed',
        top: 'calc(10px + env(safe-area-inset-top))',
        left: 10,
        zIndex: 60,
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.2)',
        color: '#fff',
        fontSize: 20,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {'←'}
    </button>
  );
}
