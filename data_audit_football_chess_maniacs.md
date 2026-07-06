# データ実態調査報告: Football Chess ManiacS

## 1. 要約(5行以内)
- プレイヤーIDはPlatform user_idそのもの(JWT `sub`)。ブラウザが `fc-platform-api` を直接叩き、`localStorage`にPlatform JWTを保存する構成(server仲介なし)。
- 試合の進行状態・戦績・レーティング・棋譜はすべてFCMS自前のCloudflare D1 / R2に保存されており、Platformの`match_results`/`match_participants`/`user_game_stats`には一切送られていない。`POST /v1/game/matches/finish` の呼び出しはコード上どこにも存在しない。
- Commerce面(購入・INGOT通貨・entitlement)はPlatformと深く連携済み(`/v1/commerce/*`, `/v1/entitlements/*`, webhook受信)。決済・所持の正本はPlatformだが、試合結果の正本はPlatformではなくFCMS自身のD1になっている。
- ターン単位の詳細行動ログ(シュート/パス/タックル/ファウル/交代等)はDurable Object内で生成されR2にgzip保存されるが、集計・構造化された「鑑定素材」としては保存されていない(生ログのみ)。
- game_idは現行コードで `football_chess_maniacs` に統一済み(旧`fcm`表記はコード上見当たらず)。ただしPlatform側`games`テーブルに`football_chess_maniacs`が実在するかはこのリポジトリからは確認不能。

## 2. プレイヤー識別(Q1-3)

**Q1. プレイヤーを識別するID**
Platform user_id(JWTの`sub`)。確認済み: `src/middleware/jwt_verify.ts` の `jwtMiddleware()` がPlatform JWTを検証して `c.set('userId', payload.sub)` する。D1の`matches.home_user_id`/`away_user_id`、`user_ratings.user_id`、`user_pieces_v2.user_id`、`user_wallets.user_id`、`teams.user_id` はすべてこのuser_idをそのまま使用(確認済み: `src/api/match.ts`, `src/server/rating.ts`, `src/migrations/0001_initial.sql` 等)。

例外: COM対戦(`POST /match/com`)は認証不要で、`com_player_${uuid切り出し}` という擬似user_idを都度生成する(確認済み: `src/api/match.ts` L259-298)。この擬似IDはPlatformのuser_idとは無関係で、レーティング加算対象からも除外される(`isRatedMatch` in `src/server/rating.ts` L67-69)。

**Q2. Football-PlatformのJWTを使っているか**
使っている(確認済み)。使用箇所:
- REST API全般: `authMode: 'game' | 'user'` の `jwtMiddleware()`(`src/worker.ts`)
- WebSocket upgrade時: `verifyWebSocketToken()`(`src/durable/game_session.ts`)
- クライアント直接呼び出し: `src/client/platform/authClient.ts` が `fc-platform-api` の `/v1/auth/login` `/v1/auth/register` `/v1/auth/google` `/v1/auth/refresh` をブラウザから直接fetchしている(確認済み)。
- サーバー側からPlatform APIを呼ぶ`callPlatformApi()`(`src/api/auth.ts`)は `authMode: 'user'`(ユーザーJWTをそのままフォワード)と `authMode: 'game'`(`PLATFORM_GAME_SERVER_TOKEN`、`gfp_...`形式のgame server token)の2系統を持つ。

**Q3. ゲストプレイの可否とデータ扱い**
可能。COM対戦(`/match/com`)はJWT不要、レート制限のみで開始できる(確認済み: `src/worker.ts` L163-168, `src/api/match.ts` L259-298)。ゲストの試合データはFCMS D1(`matches`テーブル)とR2(棋譜)に`com_player_xxx`という一時IDで記録されるが、Platform側には一切送られない。ブラウザを閉じれば`com_player_xxx`とその紐付けを再現する手段はない(推測: 事実上使い捨てのゲストIDで、次回訪問時は別IDになる。ローカル永続化コードは見当たらないため)。
フレンド対戦・ランクマッチはJWT必須(ゲスト不可、確認済み: `src/worker.ts` の `/match/*` ミドルウェア)。

## 3. 保存データの実態(Q4-6)

**Q4. 保存場所と役割**
複数のストレージを役割分担で使用している(確認済み、`src/wrangler.toml`のバインディング定義および各コードで裏付け):

| ストレージ | 役割 |
|---|---|
| Cloudflare D1 (`fcms` DB) | 試合サマリ(`matches`)、チーム編成(`teams`)、所持コマ v1/v2(`user_pieces`/`user_pieces_v2`)、レーティング(`user_ratings`)、駒マスタ(`piece_master`)、INGOTウォレットのローカルキャッシュ(`user_wallets`)、Webhook受信冪等化(`webhook_deliveries_received`)、表示名キャッシュ(`user_display_name_cache`) |
| Cloudflare R2 (`fcms-storage` バケット) | 試合の詳細棋譜(`replays/{matchId}.json.gz`、gzip圧縮JSON)。ターン単位ログ`replays/{matchId}/turn_NNN.json`も読む口があるが、書き込みコードは`worker.ts`のQueue Consumerが一括gzip書き込みするのみで、ターン単位ファイルを書くコードは見当たらない(推測: `replay.ts`のターン単位読み出しエンドポイントは現状データが存在せず404になる可能性がある) |
| Cloudflare KV (`KV` namespace) | 所持コマキャッシュ(`owned_pieces:{userId}`, TTL1時間)、フレンド対戦招待ルーム(`friend_room:{roomId}`, TTL10分) |
| Durable Object Storage (`GameSession`, `Matchmaking`) | 進行中の試合状態(盤面、ターン入力、ターンログ`turnLog`、交代残数など)。試合終了までの一時状態で、終了時にQueue経由でD1/R2へフラッシュされる |
| Cloudflare Queue (`fcms-match-results`) | DOの試合終了イベントをD1/R2永続化処理に非同期で橋渡しするだけの中継。永続ストレージではない |
| ブラウザ `localStorage` | Platform JWT(`fcms_token`/`fcms_refresh_token`/`fcms_user_id`)、前回の対戦設定(`fcms_last_setup`: ゲームモード・COM難易度・編成データのスナップショット) |
| ブラウザ `sessionStorage` | 進行中オンラインマッチの再接続用情報(`fcms_active_match`: matchId/team/gameMode。タブスコープ、認証トークンは含まない) |
| Football-Platform(Neon/Postgres) | 決済(purchases)・INGOT通貨台帳(`game_currency_balances`/`ledger`)・entitlement(所持駒/save_slot/subscription)の正本。試合結果・戦績はここには一切保存されない |

**Q5. データ構造**

`matches`(D1、確認済み: `src/migrations/0001_initial.sql`):
```sql
id TEXT PK, home_user_id TEXT, away_user_id TEXT, status TEXT,
score_home INTEGER, score_away INTEGER, created_at TEXT, finished_at TEXT
```

`user_ratings`(D1、`0001_initial.sql` + `0002_platform_integration.sql`のALTER):
```sql
user_id TEXT PK, rating INTEGER DEFAULT 1000, wins/losses/draws INTEGER,
highest_rating INTEGER, updated_at TEXT, games INTEGER, season_id TEXT
```

`teams`(D1):
```sql
id TEXT PK, user_id TEXT, name TEXT, field_pieces TEXT(JSON配列),
bench_pieces TEXT(JSON配列), slot_number INTEGER, is_active INTEGER,
formation_preset TEXT(例 '4-4-2'), created_at/updated_at TEXT
```
`field_pieces`のJSON要素例(`src/api/team.ts`のバリデーション対象型から):
```json
{ "piece_id": 12, "position": "GK", "cost": 1 }
```

`user_pieces_v2`(D1、複合PK `user_id + piece_id`):
```sql
user_id TEXT, piece_id INTEGER REFERENCES piece_master, source TEXT('founding'|'purchase'|'gift'|'reward'),
entitlement_id TEXT(Platform entitlement_id), acquired_at TEXT
```

`user_wallets`(D1、INGOTのローカルキャッシュ):
```sql
user_id TEXT PK, ingots INTEGER, updated_at TEXT
```
(注: `GET /api/shop/wallet` はこのキャッシュではなくPlatformの`/v1/commerce/currencies/{game_id}`を都度呼んで返す。`user_wallets`はwebhook受信時の反映先ローカル台帳)

R2リプレイJSON(`worker.ts`のQueue Consumerが生成するペイロード):
```json
{
  "matchId": "string",
  "homeUserId": "string",
  "awayUserId": "string",
  "turns": [
    { "turn": 1, "inputs": { "<userId>": { "match_id":"", "turn":1,"player_id":"","sequence":0,"nonce":"","timestamp":0,"client_hash":"","orders":[/* Order[] */] } },
      "events": [ /* PIECE_MOVED | ZOC_STOP | COLLISION | TACKLE | FOUL | SHOOT | PASS_DELIVERED | PASS_CUT | OFFSIDE | BATTLE_DELAY | PASSIVE_TACTICS | BALL_ACQUIRED | SUBSTITUTION | LOOSE_BALL */ ],
      "goalScoredBy": "home" | "away" | null,
      "timestamp": 0 }
  ],
  "finishedAt": "ISO8601"
}
```
(イベント型は `src/engine/types.ts` に定義、確認済み)

`localStorage['fcms_last_setup']`(`src/client/utils/lastSetup.ts`):
```json
{ "gameMode": "string", "comDifficulty": "regular", "formationData": { "...": "FormationData" }, "teamName": "string", "teamEmoji": "⚽", "origin": "custom" }
```

**Q6. 端末をまたいで引き継がれるか**
- 試合結果・レーティング・所持駒・チーム編成・INGOT(Platform正本)・棋譜: **サーバー保存(D1/R2/Platform)のため端末を変えても引き継がれる**。ユーザーIDがPlatform JWTの`sub`に紐づくため、別端末で同じアカウントでログインすれば同じデータが見える(確認済み)。
- `fcms_last_setup`(前回設定)・進行中マッチの再接続情報・JWT自体: **localStorage/sessionStorageのためブラウザ/端末ローカルであり引き継がれない**。ログインは毎端末で`fc-platform-api`にトークンを保存し直す必要がある(Universo SSO fragment経由の将来導線`ssoFragment.ts`はコード上dormantとコメントされている=2026-07-01時点でuniverso-frontpage側が未対応、確認済み)。

## 4. Platform連携の実態(Q7-9)

**Q7. `POST /v1/game/matches/finish` を呼んでいるか**
呼んでいない(確認済み: リポジトリ全体を`matches/finish`でgrepしてもヒットなし)。試合終了時に実際に起きることは:
1. `GameSession` DO の `endMatch()` が `MATCH_END` をWebSocketでブロードキャスト
2. 同じ関数が `env.MATCH_RESULT_QUEUE.send()` でCloudflare Queueに試合結果メッセージを送る(payload: `matchId, homeUserId, awayUserId, scoreHome, scoreAway, reason, disconnectLoser, turnLog, finishedAt`)
3. Queue Consumer(`worker.ts` の `queue()`)が
   - D1 `matches` の `status/score_home/score_away/finished_at` をUPDATE
   - COM戦・フレンド戦以外なら `persistRatings()` でD1 `user_ratings` のElo/wins/losses/draws/gamesを更新
   - `turnLog` をgzip圧縮してR2 `replays/{matchId}.json.gz` に保存

これらは全てFCMS自身のCloudflare資産内で完結しており、Platformへの送信は一切行われない。

**Q8. server-to-serverかクライアント直接送信か**
試合結果に関しては「送信していない」ため該当なし。ただし試合の勝敗・スコア確定ロジック自体はDurable Object(サーバー権威)で行われており、クライアントが勝敗を主張することはできない設計にはなっている(確認済み: `game_session.ts`のターン解決・ゴール判定はDO内)。**もしP10統合で`matches/finish`を実装する場合、DOからserver-to-serverで送信する構造にすることは技術的に自然**(推測: 現状のQueue Consumerの延長として実装しやすい)。

Commerce/Auth連携については**クライアント直接送信**の箇所がある。これは重大事項として明記する:
- `src/client/platform/authClient.ts` はブラウザから直接 `fc-platform-api` の `/v1/auth/login` `/v1/auth/register` `/v1/auth/google` `/v1/auth/refresh` をfetchし、レスポンスのaccess_token/refresh_tokenをそのまま`localStorage`に保存する。universo-frontpage/apps/admin(CLAUDE.md記載のhttpOnly Cookie + server仲介パターン)とは異なる設計で、トークンがブラウザJSから触れる状態にある(XSS耐性がserver仲介パターンより低い)。コード内コメントに「GrassrootsFootballと同一パターン」とあり、意図的な設計判断と見える。

**Q9. 他に呼んでいるPlatform APIの一覧**
確認済み(すべて `src/api/*.ts` 内 `callPlatformApi()` 呼び出し、およびclient直接fetch):
- `GET /v1/commerce/products?game_id=...&sale_status=on_sale` (`src/api/shop.ts`: カタログ/INGOT商品一覧。認証不要 `authMode: 'none'`)
- `GET /v1/commerce/currencies/{game_id}` (`src/api/shop.ts`: INGOT残高取得。`authMode: 'user'`)
- `POST /v1/commerce/items/purchase` (`src/api/shop.ts`: INGOTで駒を購入)
- `POST /v1/commerce/purchase` (`src/api/shop.ts`: Stripe/KOMOJU決済でINGOTパック購入、checkout_url取得)
- `GET /v1/entitlements?game_id=...&tag=fcms_piece` (`src/api/auth.ts` `getOwnedPieces()`: 所持駒entitlement一覧、KVキャッシュ併用)
- `GET /v1/entitlements?...` (`src/api/pieces.ts`: 同種)
- `POST /v1/entitlements/check` (`src/api/team.ts`: save_slot / subscription SKUの所持確認)
- `POST /v1/auth/login`, `/register`, `/google`, `/refresh` (クライアント直接、`src/client/platform/authClient.ts`)
- Webhook受信(FCMS側がエンドポイント): `POST /webhook/purchase`(`src/api/webhooks.ts`)で `entitlement.created/revoked`, `currency.granted/revoked`, `inventory.granted/revoked`, `purchase.completed` を受信しHMAC-SHA256(`X-Webhook-Signature: sha256=...`)で検証。`webhook_deliveries_received`テーブルでdelivery_id冪等化。
- 別途 `auth.ts` に旧形式の `POST /purchase` Webhook受信ハンドラも残っている(`X-HMAC-Signature`ヘッダー、`purchase_complete`イベントでKVキャッシュ無効化のみ。現行`webhooks.ts`と役割が重複しているように見える。推測: 移行途上の旧コードが残存している可能性)

## 5. 鑑定素材の棚卸し(Q10-11)

| データ名 | 現在の状態 | 保存場所 | 性格シグナル評価 | 対応しうる軸(仮) |
|---|---|---|---|---|
| 試合勝敗・スコア | 保存済み | D1(`matches`) | △ | - |
| Eloレーティング・累計wins/losses/draws/games | 保存済み | D1(`user_ratings`) | △ | consistency |
| シュート選択(誰が・いつ・結果) | 計測しているが保存していない(生ログのみ) | R2棋譜(gzip、集計なし) | ◎ | risk_taking |
| パス選択(PASS_DELIVERED/PASS_CUT) | 計測しているが保存していない | R2棋譜(生ログのみ) | ◎ | altruism, creativity |
| タックル・ファウル(TACKLE/FOUL) | 計測しているが保存していない | R2棋譜(生ログのみ) | ◎ | discipline, risk_taking |
| 交代采配(SUBSTITUTION、残数管理あり) | 計測・一部保存(remainingSubsはDO内のみ、確定交代はturnLogのみ) | DO一時状態 + R2棋譜 | ○ | deliberation |
| オフサイド(OFFSIDE) | 計測しているが保存していない | R2棋譜(生ログのみ) | △ | discipline |
| ターン消費時間・タイムアウト起因の空入力 | 計測(`turnStartedAt`, alarmによる自動パス) しているが集計未保存 | DO一時状態(終局後は生ログのturnLog.timestampのみ) | ◎ | deliberation, resilience |
| 途中離脱(disconnect)・不戦敗 | 保存済み(matches.status='disconnect') | D1(`matches`) | ○ | resilience |
| COM難易度選択(easy/regular/hard等) | 保存されていない(DO一時状態のみ、試合終了後は破棄) | DO一時状態のみ | ○ | risk_taking, deliberation |
| プレイ時代設定(comEra、13時代選択) | 保存されていない(DO一時状態のみ) | DO一時状態のみ | △ | creativity |
| チーム編成(フィールド11人+ベンチ、コスト配分、フォーメーション) | 保存済み | D1(`teams`) | ◎ | risk_taking, creativity |
| 選択している駒(200人の個性キャラから誰を選ぶか) | 保存済み(所持は`user_pieces_v2`、編成選択は`teams.field_pieces`) | D1 | ◎ | creativity, sociability(キャラ愛着) |
| フレンド対戦 vs ランクマッチ vs COM戦の選択比率 | 保存されていない(matchId prefixで種別判定は可能だが集計クエリ・保存は無し) | 未集計(D1に生データはあるが集計ビューなし) | ○ | sociability, risk_taking |
| 連続プレイ日数・プレイ頻度 | 保存されていない(created_atの生ログはあるが集計なし) | 未集計 | △ | consistency |
| 購入行動(どの駒を課金/INGOTで買ったか) | 保存済み(Platform正本 + `user_pieces_v2.source='purchase'`) | Platform DB + D1 | ○ | risk_taking(課金傾向) |
| リプレイ視聴行動 | 保存されていない(API提供のみ、閲覧ログなし) | 未計測 | △ | - |

**game_id突き合わせ**: このリポジトリのコード中で使われているgame_idリテラルは一貫して `football_chess_maniacs`(`src/wrangler.toml`の`PLATFORM_GAME_ID`, `src/api/auth.ts`の`DEFAULT_PLATFORM_GAME_ID`, `src/client/platform/config.ts`の`PLATFORM_GAME_ID`, `docs/fcms_ingot_platform_service_runbook.md`)。旧`fcm`という短縮game_idはコード内に見当たらない。Platform側CLAUDE.mdの運用ログにある「game_id `fcm`」表記は本リポジトリの現行実装とは一致せず、**推測: 初期のFCM連携作業時点(P10着手前)では`fcm`という仮のgame_idが検討/登録されていたが、後にFCMS側の正式なgame_idとして`football_chess_maniacs`に統一された可能性が高い**。Platform本番の`games`テーブルに`football_chess_maniacs`が実在するかどうかはこのリポジトリからは確認できない(Platform側での確認が必要)。

## 6. リスクと特記事項(Q12-13)

**Q12. データ消失リスク**
- 試合結果・戦績・所持駒・レーティングはすべてサーバー(D1/R2)保存であり、`localStorage`依存によるデータ消失リスクは低い。
- ただし`fcms_last_setup`(前回設定)は`localStorage`のみのため、ブラウザデータ削除やシークレットモードでは失われる(実害は軽微=UI利便性のみ)。
- COM対戦(ゲスト)は`com_player_xxx`という都度生成IDでD1/R2に記録されるが、ユーザーが再訪時にこのIDへ再アクセスする手段が無い(推測: 事実上そのゲスト試合データは追跡不能になり、ストレージ上は残るが誰にも紐付かないゴミデータ化する)。
- R2の`replays/{matchId}/turn_NNN.json`(ターン単位)を読むAPI(`replay.ts`)はあるが、書き込みコードが見当たらない。ここにアクセスすると常に404になる可能性がある(推測、要動作確認)。
- `webhook_deliveries_received`や`user_wallets`など、D1側のみでの障害復旧(Platform再送)は仕組みとして冪等化されており良好(確認済み)。

**Q13. FCMS固有の特殊事情**
- 試合はDurable Object 1試合=1DOで、ターン制ヘックスチェス型サッカーというルール上、行動ログの粒度が非常に細かい(1ターンごとに両陣営のオーダー・エンジンイベントが記録される)。これは「性格シグナル」の原材料としては他ゲームより圧倒的に豊富だが、**現状は集計も構造化保存もされておらず、R2のgzip生ログを都度解凍・パースしない限り利用できない**。
- 200人の個性キャラクター(駒)を所持・編成する仕組みがあり(`docs/lore/`にキャラ設定あり)、「どのキャラを選ぶか/課金してでも欲しがるか」は編成データ・購入データとして既にD1/Platform双方に残っている。これは性格プロファイリングの比較的取り出しやすい材料になり得る。
- ブラウザがPlatform APIを直接叩く設計(`authClient.ts`)は、GrassrootsFootballと同一パターンだが、universo-frontpage/adminのserver仲介+httpOnly Cookieパターンとは異なる。トークン漏洩耐性の観点でapps間の設計が不統一である点は注意。
- 旧`auth.ts`の`/purchase`Webhookハンドラ(`X-HMAC-Signature`)と現行`webhooks.ts`の`/webhook/purchase`(`X-Webhook-Signature`)が並存しており、片方が未使用の残存コードである可能性がある(推測、削除要否はコード外の運用判断)。

## 7. 人物録接続への所感(実装しない・見積もりのみ)

Platform戦績(`match_results`/`match_participants`/`user_game_stats`)にFCMSを接続するために必要な作業の見積もり(実装はしていない):

1. **Game Server Token発行・登録**(Platform側作業、CLAUDE.md記載のP10運用タスクと同一): `football_chess_maniacs` を`games`テーブルに登録し、`gfp_...`トークンを発行して`PLATFORM_GAME_SERVER_TOKEN` Secretに設定する。現状Secretは`.dev.vars`にダミー値(`e2e-dummy`)があるのみで、本番トークンが設定済みかはこのリポジトリからは確認不能。
2. **`endMatch()`からの`matches/finish`呼び出し追加**: `game_session.ts`の`endMatch()`(またはそれを呼ぶ`worker.ts`のQueue Consumer)に、Platformの`POST /v1/game/matches/finish`をserver-to-serverで叩く処理を追加する。冪等キーは`(game_id, external_match_id)`なので`matchId`をそのまま`external_match_id`として使える。
3. **payload設計**: 現状`score_json`/`stats_json`はPlatform側で完全にスキーマフリーなので、`turnLog`から抽出した集計値(シュート数、パス数、ファウル数、交代回数など)をFCMS側で事前集計してから送る設計にできる。生の`turnLog`全体をそのまま送るか、集計してから送るかは要検討(生ログはR2に既にあるため重複保存を避けるなら集計値のみで良い)。
4. **ゲスト(COM戦)の扱い**: `match_participants.user_id`はNULL許容設計(Platform側)なので、COM戦は`user_id=NULL`+ゲストsession的な扱いで送るか、そもそも送らない(現状の`isRatedMatch`同様COM/フレンドは対象外にする)かの方針決定が必要。
5. **集計ロジックの新規実装**: 現状FCMS側にシュート数・パス数・ファウル数などをターンログから集計するコードは存在しない。これをQueue Consumer内(またはDO内の`endMatch`直前)に新規実装する必要がある。
6. **重複正本の整理**: FCMS自身の`user_ratings`(Elo)は今後もFCMS内部のランキング表示用として残す設計にするか、Platform`user_game_stats`に統合するかの設計判断が必要(現状は完全にFCMS内で閉じている独立系)。

全体として、Commerce連携(P11/P12相当)はすでに深く作り込まれているのに対し、Match Result連携(P6相当)はコードが一切存在せず、ゼロから追加実装が必要な状態である。
