# 編成画面 棚卸し（2026-07-07）— 現状仕様 vs あるべき論点リスト

関連Issue: #16（ショップ導線）/ #18（セーブ未永続化）/ #19（遷移仕様）
正本仕様書: `docs/formation-spec.md`（v2）
本ドキュメントは方針決定のための現状整理。決定後に formation-spec を v3 に改訂する。

---

## 1. 現状の実装（コードベースの事実）

### データフロー
- **手持ちコマ**: `Formation.tsx` の `createInitialOwned()` による**ハードコード11枚**（GK/DF×4/MF×4/FW×2、コスト1、仮名「CB 1」「MF 2」等）。サーバーから一切取得していない（コード内コメント「本来はサーバーから取得」）。
- **セーブスロット**: React state のみ（`useState(Array(10).fill(null))`）。localStorage にもサーバーにも保存されず**リロードで消える**。
- **isPremium**: App.tsx が prop を渡しておらずデフォルト `true` → ゲスト含む全員にセーブUIが解放されている（#18 の「ゲストでもセーブできる」の直接原因）。
- **編成確定**: `onFormationConfirm` → App.tsx `startMatch(gameMode, comDifficulty, data, pendingOpponent)` → マッチングへ直行。FormationData の id は `own-gk-1` 等の**仮ID**で、`piece_master` の piece_id と無関係。

### サーバー側は受け皿が完成済み（未接続なだけ）
| API | 内容 | 状態 |
|---|---|---|
| `GET /api/pieces` | 所持コマ一覧（`user_pieces_v2` JOIN `piece_master`、200キャラ実名・era・画像素材情報） | ✅ 実装済み・未接続 |
| `POST /api/pieces/sync` | Platform entitlement 差分同期 + **Founding Eleven（初期11枚、piece_id 8,9,10,23,35,36,37,55,70,82,104）自動付与** | ✅ 実装済み・未接続 |
| `GET/POST/PUT/DELETE /api/teams` | 編成CRUD（slot_number 1〜10、is_active、GK1枚/コスト16バリデーション、所持チェック） | ✅ 実装済み・未接続 |
| スロット数判定 | 無料=1枠、`fcms_save_slots_9` 買い切り=10枠、サブスク `uf_subscription_monthly_premium`=1+3枠。期限切れ上位スロットは読み取り専用 | ✅ 実装済み・未接続 |

※ オンライン対戦のサーバー側編成反映（`createBoardFromFormation`）は D1 `teams.field_pieces` を読む設計のため、**編成画面が /api/teams に保存しない限りオンライン対戦に編成が反映されない**（現状は JOIN_QUEUE の teamId 解決で is_active チームを探すが、編成画面から作られたチームが D1 に存在しない）。

### 画面遷移（現状）
1. 入口: マイページ「編成する」/ ModeSelect 経由（`pendingOpponent` を保持）
2. 「戻る」→ title / 「プリセットチーム」→ PresetTeamsScreen（戻り先=formation）
3. 「マッチング開始」→ 確定=マッチング直行（保存して戻る動線なし）
4. 「ショップ」→ 外部 Universo Futbol ショップ（同タブ、`formation_save_slot` 直リンク）
5. 「セーブ/ロード」→ スロットモーダル（メモリのみ）

---

## 2. formation-spec.md（v2）との主な乖離

| 項目 | spec v2 | 実装 |
|---|---|---|
| 手持ちコマ | 所有コマ最大200個から選ぶ・ショップで購入して集める | ハードコード11枚固定 |
| カード表示 | 顔イラスト・キャラ名・コスト枠装飾（銅/銀/金/虹） | PieceIcon（ポジション+コストのランク画像）のみ、仮名 |
| コマの名前付け | 任意の名前を付けられる | なし |
| セーブスロット | 画面上部タブ・スロット名任意・「＋」で追加 | モーダル・番号固定1〜10・名前なし |
| セーブデータ | slotName・x/y自由座標 | systemBase・col/row（HEXスナップ）※HEXスナップは実装上の改善で妥当 |
| コマ移動 | 長押しドラッグ | タップ→空きHEXタップ（specに「要検討」の注記ありなので許容範囲） |
| フッター | 「戻る」のみ | 戻る+プリセット+マッチング開始（specに編成→対戦直結の記述なし） |
| 課金 | 記述なし（旧仕様） | セーブ枠entitlement（サーバーのみ）・Platformショップ直リンク |

---

## 3. 論点リスト（要方針決定）

### 論点1: 所持コマのデータソース【最重要】
買ったコマが編成に出ない現状は課金導線として崩壊している。
- **案A（推奨）**: ログイン時は `POST /api/pieces/sync` → `GET /api/pieces` で実所持コマ（200キャラ実名）を表示。ゲストは Founding Eleven 相当のローカル固定11枚+「ログインでコレクションが増える」誘導。
- 案B: 全員ローカル固定のまま（現状維持、ショップ意味なし）
- 案C: ゲストにも全コマ開放（マネタイズ崩壊）

### 論点2: セーブ/ロードの永続化とゲストの扱い
- **案A（推奨）**: ログイン時は `/api/teams` にサーバー保存（スロット数はentitlement準拠）。ゲストは明示セーブUIなし+最後の編成を localStorage に自動保存（既存の `fcms_last_setup` と統合）し、セーブボタンを押したら `requireLogin('formation_save')`。
- 案B: ゲストにも localStorage で1枠の明示セーブを許す
- 案C: セーブは完全ログイン限定（ゲストは毎回組み直し）

### 論点3: 編成画面の役割（確定=マッチング直結をやめるか）
- **案A（推奨）**: 「保存」と「対戦」を分離。常設ボタンは「保存して戻る」。ModeSelect等の対戦フロー文脈から来た場合のみ「この編成で対戦」を主ボタンとして表示（pendingOpponent の有無で出し分け可能）。
- 案B: 現状維持（確定=マッチング開始のみ）
- 案C: 編成画面は保存専用にし、対戦は必ずマイページ/ModeSelectから

### 論点4: キャラクター統合（コレクションとの一貫性）
- **案A（推奨）**: 編成カードに実キャラ名（`name_ja`/ロケール別）・era表示を出し、CollectionScreen と視覚言語を揃える。顔イラストは既存資産が `public/assets/pieces/`（ランク別トークン）のみのため当面トークン画像でよい（spec の「顔イラスト」「コスト枠装飾」は素材が揃い次第）。
- 案B: 現状の仮名のまま

### 論点5（軽微・推奨実行でよい）
- ショップボタンのラベルを「セーブ枠を購入 ↗（Universo Futbol）」に変更、別タブで開く（#16）
- スロットUIに名前付けを追加（サーバー `teams.name` は既に対応済み）
- `POST /api/pieces/sync` をログイン直後（AuthContext）に1回呼び、Founding Eleven を確実に付与

---

## 4. 決定事項（記入欄）

| 論点 | 決定 | 日付 |
|---|---|---|
| 1 所持コマ | 案A: サーバー実データ接続（ログイン=/api/pieces、ゲスト=Founding Eleven 11キャラ+ログイン誘導） | 2026-07-07 |
| 2 セーブ/ロード | 案A: ログイン=/api/teamsサーバー保存（entitlement枠準拠）、ゲスト=明示セーブなし・ドラフト自動保存+requireLogin誘導 | 2026-07-07 |
| 3 画面の役割 | 案A: 保存と対戦を分離。「保存して戻る」常設、対戦フロー文脈でのみ「この編成で対戦」 | 2026-07-07 |
| 4 キャラ統合 | 案A: 実キャラ名+era表示に統一（顔イラストは素材が揃い次第） | 2026-07-07 |
| 5 軽微改善 | 実施（ショップラベル明確化+別タブ、スロット名、ログイン後sync） | 2026-07-07 |

## 5. 実装時の追加決定（コード調査による）

- **Founding Eleven はサーバー実装を正とする**: piece_id {8:GK, 9:DF, 55:DF, 37:SB, 70:SB, 35:VO, 10:MF, 82:MF, 23:WG, 36:FW, 104:FW}（全コスト1、OMのみ未所持）。spec v2の「GK1/DF4/MF4/FW2」は廃止。
- **field_pieces にcol/rowを正式追加**: DO側 `createBoardFromFormation` は既にcol/row対応済み。team.ts の FieldPiece 型・バリデーションに正式追加する。
- **セキュリティ修正**: `/api/teams` がクライアント申告の cost/position を信用している（コスト偽装でレート戦に持ち込める）→ piece_master から正規値を解決するようサーバー側を修正。
