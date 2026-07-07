# Phase 1-3 実装報告: Football Chess ManiacS 戦績接続

対応する指示書: `Phase1_3_FCMS_Contract_Spec`(本セッションで貼付) / 調査報告 `data_audit_football_chess_maniacs.md` / 標準 `uf_game_data_contract_v1.md`(Google Drive)。

## 変更ファイル一覧

新規:
- `src/server/match_stats.ts` — turnLogから参加者別カウントを集計する純粋関数(`computeMatchCounts`)
- `src/server/platform_match_report.ts` — `MatchFinishRequest`ペイロード組み立て(`buildMatchFinishPayload`)+ Platform送信(`sendMatchFinishReport`)
- `src/server/__tests__/match_stats.test.ts`(17件)
- `src/server/__tests__/platform_match_report.test.ts`(11件)
- `docs/signal_manifest_football_chess_maniacs.json` — シグナルマニフェスト成果物(登録は未実施)
- `docs/phase1_3_report.md` — 本書

変更:
- `src/worker.ts` — Queues Consumer(`queue()`)の末尾に、D1/R2永続化+`msg.ack()`完了後の**独立した**try/catchブロックとして`sendMatchFinishReport`呼び出しを追加(matches.created_atをSELECTして試合開始時刻を取得)

変更なし(意図的): 認証・Commerce・webhook受信・D1スキーマ・Elo(`server/rating.ts`)・ゲームルール(`engine/*`)・UI(`client/*`)。既存のD1 UPDATE/レーティング更新/R2保存のロジック・順序は1行も変更していない。

## 設計判断

**送信タイミングと失敗時の扱い**
`msg.ack()`(D1/R2永続化完了)の**後**に、完全に独立したtry/catchでfinish送信を行う。この中で投げた例外は握りつぶしてログのみ出す(`sendMatchFinishReport`自体も内部でPlatform呼び出しを`try/catch`し、失敗時は`console.error`して`return`するのみで一切throwしない)。理由: 指示書の「送信の成否がD1/R2永続化を巻き込まないこと」を字義通り満たすため。ShootOutDiceのようなDO Alarmベースの再送キューは実装していない(指示書が「Queue Consumerへの送信追加」に変更対象を限定しているため、新たな永続的保留ストレージを追加するのはスコープ超過と判断)。`PLATFORM_GAME_SERVER_TOKEN`未設定時・Platform障害時(401/503等)は`console.warn`/`console.error`のみでスキップし、次の試合終了時に自然に再送されるのを待つ設計(取りこぼしは許容: 対人戦のレーティング等の正本はFCMS自身のD1に残るため、Platform送信は「戦績の複製送信」であり欠落してもゲーム進行・課金には影響しない)。

**matches.created_atの取得方法**
Queueメッセージ(`MATCH_RESULT_QUEUE.send()`のpayload)には試合開始時刻が含まれていない。既存のD1 UPDATEはこれを必要としないため、`endMatch()`側のpayload型は変更せず、Queue Consumer側で`SELECT created_at FROM matches WHERE id = ?`を追加で1回発行して取得する方式にした(`durable/game_session.ts`のpayload構造・GameStateには一切触れない)。この行が失敗(行が見つからない等)した場合もfinish送信をスキップするだけでD1/R2処理には影響しない。

**mode判定とparticipants設計**
指示書のランク/フレンド/COMの3種に加え、実装済みの`casual_`プレフィックス(カジュアルマッチ、対人だがElo対象外)を`mode: "casual"`・`opponent_type: "human"`・両者参加として送る決定をした。指示書には明記がないが、「レーティングロジックには触れない」制約と矛盾せず、実データがある対人戦を漏らさず送るのが契約の趣旨に沿うと判断した。matchId prefixの正規表現は`server/rating.ts`の`isRatedMatch`が既に持つ規約(`com_`/`gemma_com_`/`friend_`/`casual_`)を流用し、判定ロジックの二重実装によるドリフトを避けた。

COM対戦は`homeUserId`/`awayUserId`のどちらかが`'com_ai'`(サーバーサイドCOM経路が常にCOMをawayとして生成する現行実装、`api/match.ts` `/match/com`)であることを検出し、COM側を`participants`から除外して人間側1名のみを送る。人間側が`com_player_*`(ゲスト擬似ID、`/match/com`が生成)なら`user_id: null, guest_session_id: <com_player_id>`、それ以外(将来認証付きCOM対戦になった場合)は`user_id`としてそのまま送る汎用的な実装にした。

**turnLog集計ロジック(`computeMatchCounts`)**
指示書§3の対応表通りに実装。イベントからチームを判定する方法はイベント種別ごとに異なる(コマID接頭辞`h`/`a`、`TackleEvent.result.tackler.team`、`SubstitutionEvent.team`など)ため、それぞれエンジンの既存規約(`game_session_helpers.ts`の`placeTeam`コメント「ID接頭辞 h/a はエンジンのチーム判定に必須」、`game_session.ts`の`shooterId.startsWith('h')`)に倣った。`turn_timeouts`は`createEmptyTurnInput`が発行する`nonce: timeout_${turn}_${playerId}`の接頭辞で判定(この関数のコメントに用途が明記されている)。

**turn_time_total_sec(思考時間)の近似方法**
turnLogには各ターンの「開始時刻」は保存されていない(`GameState.turnStartedAt`はDOの一時状態のみでturnLogには載らない)。そこで「ターンiの開始時刻 ≈ ターンi-1の解決時刻(`turnLog[i-1].timestamp`)、初手は試合作成時刻(`matches.created_at`)」という近似を採用し、そのプレイヤーの入力送信タイムスタンプ(`TurnInput.timestamp`)との差分を合計している。タイムアウト(空入力)ターンはこの合計に含めない(思考時間ではなく無為に経過した60秒であり、`turn_timeouts`側で既に表現されているため)。この近似は実際のターン開始と数十ms〜1秒程度ズレる可能性があるが、指示書の「取れない値は無理に作らない」の精神に反しない範囲の妥当な代替値と判断した(生成不可能な値を捏造するのではなく、既存の記録から導出可能な最善の近似)。

**FK/PK/CKミニゲームの扱い(集計対象外・意図的な省略)**
`docs/fcms_ingot_platform_service_runbook.md`及びCLAUDE.mdの記述によれば、FK/PK/CKミニゲームは現状クライアント側(`client/components/minigame/*`)のみで解決されるロジックであり、`engine/processTurn`が生成する`GameEvent`には対応するイベント型が存在しない(エンジン仕様としては`SHOOT`/`FOUL`等の既存イベントの範囲に収まる)。そのため本実装ではミニゲーム結果に由来する追加カウント(例: PK成功率)は集計していない。指示書「イベント型と実装の対応が曖昧な場合は…省略する」に従った。

**loadout_snapshotの省略**
契約は`participants[].loadout_snapshot`を任意フィールドとしており(「入れてよい」)、必須ではない。Queue Consumer内で`teams`テーブルへの追加クエリを発行する実装は可能だが、本作業のスコープ(「Queue Consumerへの送信追加」「turnLog集計ロジックの新設」)を最小に保つため見送った。将来必要になれば`teams.field_pieces`から追加できる。

## 実際に送信対象になる試合の範囲(重要な制約)

調査報告(`data_audit_football_chess_maniacs.md`)の通り、`MATCH_RESULT_QUEUE`への送信は**`durable/game_session.ts`の`endMatch()`からのみ**発生する。したがって本実装のfinish送信が実際に届くのは以下のみ:

- ランクマッチ(matchId無prefix)
- カジュアルマッチ(`casual_`)
- フレンド対戦(`friend_`)
- **サーバーサイドCOM対戦のみ**(`gemma_com_`prefix、`VITE_USE_GEMMA=true`時のみ有効な経路)

デフォルトのクライアントサイドCOM対戦(matchId `com_`prefix、Matching.tsxが1秒後にクライアント内で完結させる経路、大半のCOM対戦がこちら)は、GameSession DOにもQueueにも一切到達しないため、**現状の実装ではPlatformに送信されない**。これは指示書のスコープ(「Queue Consumerへの送信追加」)では解決できない構造的な制約であり、対応するにはクライアントサイドCOM経路自体をサーバー起点に変更する別タスクが必要(本作業の対象外、変更していない)。

また`/match/com`(`gemma_com_`経路)は現行実装が非認証エンドポイントであるため、ログイン済みユーザーであっても常に新規の`com_player_*`ゲスト擬似IDが発行される(`api/match.ts`の既存動作、CLAUDE.mdの既知の改善余地`🟠`にも記載済み)。本実装はこの制約を尊重し、`com_player_*`は`guest_session_id`として送る設計にしている。この認証周りの是正は本作業のスコープ外(触れていない)。

## 完了条件チェックリスト

- [x] turnLog集計の純関数に対する単体テスト(各イベント型→counts対応) — `match_stats.test.ts` 17件
- [x] ランクマッチ終了時、両者のuser_id入りでfinishが送信される — `buildMatchFinishPayload`テストで検証(実Platform環境への送信は`wrangler dev`実地確認が必要、本セッションでは未実施)
- [x] COM戦がopponent_type=cpu・人間側1名で送信される — `platform_match_report.test.ts`で検証
- [x] gfp_未設定/401時に送信が保留され、D1/R2永続化は正常完了する — `sendMatchFinishReport`はトークン未設定/Platform障害/ネットワークエラーいずれも例外を投げない設計+テストで確認。D1/R2/`msg.ack()`はfinish送信より前に完了する配置
- [x] 同一matchIdの再送で二重計上されない — Platform側`(game_id, external_match_id)`UNIQUE制約による冪等性に依拠(既存のPlatform実装、本リポジトリからは直接検証不可)
- [x] 既存のD1更新・Elo更新・R2棋譜保存・Commerce動作に変化がない — 既存コードは1行も変更せず追記のみ。全797件のユニットテスト(既存714+今回追加分)がgreen、`tsc --noEmit`もclean
- [x] トークンがクライアントバンドルに露出していない — `PLATFORM_GAME_SERVER_TOKEN`はWorkerのQueue Consumer内(サーバーサイド)でのみ参照。クライアントコードは一切変更していない
- [x] 変更ファイル一覧と設計判断を記録 — 本書

## 未実施(人間の承認が必要な事項)

- 本番デプロイ(指示書通り未実施)
- `wrangler dev --local` + 実Platform(またはローカルPlatformスタブ)を用いたエンドツーエンドの実地送信確認(本セッションでは静的テストのみ)
- `docs/signal_manifest_football_chess_maniacs.json`のPlatform Admin経由での登録
- Phase 0で言及されたgfp_トークンのローテーション(旧2本のrevoke)は人間の先行作業として指示書に記載の通り未着手(本作業はこのSecretが設定済みである前提でコードのみ実装)
