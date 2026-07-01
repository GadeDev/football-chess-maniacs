// =====================================================================
// useLocale.ts — React 結線
// ロケール変更時にコンポーネントを再レンダリングさせるフック。
// 言語切替プルダウン(フェーズ6)を入れると、t()/tn() を使う画面が自動更新される。
// =====================================================================

import { useSyncExternalStore } from 'react';
import { getLocale, addLocaleListener, type Locale } from './index';

/** 現在のロケールを購読する。setLocale() のたびに再レンダリングされる。 */
export function useLocale(): Locale {
  return useSyncExternalStore(addLocaleListener, getLocale, getLocale);
}
