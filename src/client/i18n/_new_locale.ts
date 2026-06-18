// =====================================================================
// _new_locale.ts — 言語追加用テンプレート(コピー元)
//
// 使い方:
//  1. このファイルを <locale>.ts にコピー(例 ko.ts / es.ts / zh-CN.ts)
//  2. 各値を訳す。ja.ts / en.ts と同じキー集合を維持する(キー数パリティ必須)
//  3. index.ts で import / DICTS / SUPPORTED_LOCALES に追加
//  4. 既存の全辞書に header.lang_<locale>(プルダウンのラベル)を1行追加
//
// 注意(教訓1): 複数形なし言語(ko / zh-CN)は `.one` を書かず `.other`(または root)
//   のみにする。lookupPlural() が同一ロケール内で解決し切るため日本語混入は起きない。
// =====================================================================

import type { Dict } from './index';

const _new_locale: Dict = {
  // header.lang_xx: '<language name in its own script>',
  // ... ja.ts と同じキーをすべて訳して並べる
};

export default _new_locale;
