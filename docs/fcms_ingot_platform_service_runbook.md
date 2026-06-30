# FootballChessManiacS INGOT Platform Service Runbook

作成日: 2026-06-30
対象repo: `/Users/yanagiho-mba/football-chess-maniacs`
game_id: `football_chess_maniacs`
非対象: `football-chess-next`

## 1. 目的

FootballChessManiacS の賞品購入を UniversoFutbol Platform の課金/通貨台帳に接続し、FCMS賞品をINGOT消費で購入できる状態にする。

この手順書では、Platformを正の台帳、FCMS D1をゲーム表示/同期キャッシュとして扱う。

## 2. 完了条件

- Universo SSOでFCMSに入ったユーザーが、FCMS Shopを開ける。
- INGOT残高はPlatformの `game_currency_balances` 由来で表示される。
- INGOTパックはPlatform Checkoutで購入できる。
- Checkout完了後、Platformが `currency.granted` webhookを送り、FCMS側でも残高/表示が更新される。
- FCMS賞品は `POST /v1/commerce/items/purchase` 経由で購入される。
- Platform側でINGOTが原子的に減算され、賞品grantが作成される。
- FCMS側 `user_pieces_v2` に購入済みコマが反映される。
- 同じコマを二重購入してINGOTだけ失う経路がない。
- `football-chess-next` には変更が入っていない。

## 3. 現状確認

2026-06-30時点の確認結果:

- FCMS Workerの `/` は未デプロイ環境では404。`/health` と `/api/shop/catalog` は稼働。
- FCMS D1の `piece_master` カタログは188件。
- Platform本番の `football_chess_maniacs` 商品は `fcms_piece_001` の1件のみ。
- `fcms_piece_001` にはJPY 300のStripe価格があるが、`currency_prices` は空。
- FCMS用INGOTパック商品はPlatform本番に未登録。
- Platformには `POST /v1/commerce/items/purchase` があり、INGOT残高を減算してgrantを処理できる。
- Platformには `product_currency_prices` テーブルがあるが、現時点でAdmin APIから登録する経路は見当たらない。API追加かSQL seedが必要。

確認コマンド:

```bash
curl -sS 'https://fc-platform-api.yanagiho.workers.dev/v1/commerce/products?game_id=football_chess_maniacs&sale_status=on_sale' | jq .
curl -i 'https://football-chess-maniacs.yanagiho.workers.dev/health'
curl -sS 'https://football-chess-maniacs.yanagiho.workers.dev/api/shop/catalog?limit=1' | jq .
```

## 4. 全体方針

### 4.1 INGOT購入

```text
FCMS Shop
  -> POST /api/shop/ingots
  -> Platform POST /v1/commerce/purchase
  -> Stripe Checkout
  -> Platform payment webhook
  -> Platform game_currency_balances += INGOT
  -> Platform currency.granted webhook
  -> FCMS表示/キャッシュ更新
```

### 4.2 FCMS賞品購入

```text
FCMS Shop
  -> POST /api/shop/purchase
  -> Platform POST /v1/commerce/items/purchase
  -> Platform game_currency_balances -= INGOT
  -> Platform entitlement/inventory grant
  -> Platform entitlement.created or inventory.granted webhook
  -> FCMS user_pieces_v2 同期
```

FCMS側で `user_wallets.ingots` を直接減算する処理は、最終的には購入の正経路から外す。

## 5. Platform側作業

### 5.1 FCMS用INGOTパックを作成

目的: ユーザーが現金決済でINGOTを購入できるようにする。

登録内容:

- `game_id`: `football_chess_maniacs`
- `product_type`: `currency_pack`
- `sale_status`: `on_sale`
- `metadata.currency_code`: `INGOT`
- `metadata.currency_amount`: 付与INGOT数
- active Stripe price
- grant:
  - `grant_type`: `currency`
  - `grant_ref_id`: `INGOT`
  - `quantity`: 付与INGOT数

推奨パック例:

| slug | title | grant | 備考 |
| --- | --- | ---: | --- |
| `fcms_ingot_pack_starter` | `FCMS INGOT Pack Starter` | 5 | 小額テスト用 |
| `fcms_ingot_pack_standard` | `FCMS INGOT Pack Standard` | 12 | 通常導線 |
| `fcms_ingot_pack_mega` | `FCMS INGOT Pack Mega` | 30 | 高額導線 |

### 5.2 FCMS賞品をPlatform商品として登録

目的: FCMSの各賞品をINGOTで買える商品にする。

各コマについて登録する内容:

- `game_id`: `football_chess_maniacs`
- `slug`: `fcms_piece_001` のようにFCMS SKUと一致
- `product_type`: `piece`
- `scope`: `game`
- `metadata.sku`: `fcms_piece_001`
- `metadata.piece_id`: `1`
- `sale_status`: `on_sale`
- `product_currency_prices`:
  - `currency_code`: `INGOT`
  - `amount`: 必要INGOT数
  - `is_active`: `true`
- grant:
  - `grant_type`: `entitlement`
  - `grant_ref_id`: `fcms_piece_001`
  - `quantity`: `1`

INGOT価格はFCMS側の現行 `pieceCostToIngots()` と同じルールで初期投入し、将来はPlatform DBを正にする。

### 5.3 `product_currency_prices` 登録手段を用意

現状のPlatform codeでは、公開APIは `currency_prices` を返すが、Admin APIで `product_currency_prices` を作る経路が見当たらない。

どちらかを実施する:

- 推奨: Platform Admin APIに `POST /v1/admin/products/{product_id}/currency-prices` を追加する。
- 暫定: SQL seed/migrationで `product_currency_prices` に投入する。

SQL seedの形:

```sql
INSERT INTO product_currency_prices (
  product_id,
  game_id,
  currency_code,
  amount,
  is_active
)
VALUES (
  '<product_uuid>',
  'football_chess_maniacs',
  'INGOT',
  <ingot_amount>,
  true
);
```

### 5.4 INGOT専売の公開条件を修正

現状のPlatform Admin公開条件は、`on_sale` への遷移時にactiveな通常 `product_prices` を要求している。

FCMS賞品をINGOT専売にする場合は、公開条件を次のように変更する:

```text
on_saleにできる条件:
  grantが1件以上ある
  かつ
  active product_prices または active product_currency_prices が1件以上ある
```

この変更を入れない場合、INGOT専売商品にもStripe priceが必要になり、現金直買い導線が残る。

### 5.5 現金直買い導線を止める

FCMS賞品はINGOT購入のみなので、piece商品の通常Stripe priceは無効化する。

現状の `fcms_piece_001` はJPY 300のStripe priceを持っているため、INGOT価格登録後に無効化する。

INGOTパック商品だけは通常Stripe priceを持つ。

### 5.6 二重購入防止をPlatformに追加

Platform `POST /v1/commerce/items/purchase` は `inventory_item` grantの重複チェックはあるが、`entitlement` grantの重複チェックが不足している。

`grant_type = entitlement` の場合も、購入前に次をチェックする:

```text
entitlements.user_id = userId
entitlements.game_id = product.gameId
entitlements.sku IN grant_ref_id list
entitlements.state = active
```

該当があれば、INGOT減算前に `409 ALREADY_OWNED` を返す。

## 6. FCMS側作業

### 6.1 `POST /api/shop/ingots` の小修正

`src/api/shop.ts` の `POST /api/shop/ingots` で `c.req.json()` を二回読んでいる箇所を一回に直す。

完了後、既存テストに「空bodyでも最小INGOT商品を選ぶ」ケースを追加する。

### 6.2 残高取得をPlatformに寄せる

対象: `src/api/shop.ts`

`GET /api/shop/wallet` はPlatformのユーザーJWTで次を呼ぶ:

```text
GET /v1/commerce/currencies/football_chess_maniacs
Authorization: Bearer <user_jwt>
```

レスポンスの `balances` から `currency_code = INGOT` を探し、`{ ingots }` として返す。

Platform障害時の扱い:

- サービスイン前: 502を返して障害を見える化。
- サービス安定後: 表示用途だけFCMS D1キャッシュにフォールバック可。ただし購入可否はPlatformを正にする。

### 6.3 Shop catalogにPlatform product情報を混ぜる

対象: `src/api/shop.ts`

`GET /api/shop/catalog` でPlatform商品一覧を取得し、`piece_master.sku` と `product.metadata.sku` または `product.slug` を突合する。

返す項目に追加する:

- `product_id`
- `ingot_price`
- `is_on_sale`
- `platform_configured`

`currency_prices` に `INGOT` のactive価格がない商品は購入ボタンを無効化できるようにする。

### 6.4 `POST /api/shop/purchase` をPlatform経由に変更

対象: `src/api/shop.ts`

現行のFCMS D1直接減算をやめ、次を呼ぶ:

```text
POST /v1/commerce/items/purchase
Authorization: Bearer <user_jwt>
Idempotency-Key: <uuid>

{
  "product_id": "<platform_product_id>"
}
```

互換性のため、当面はbodyで `piece_id` を受けてもよい。ただし内部でPlatform productに解決してから購入する。

推奨リクエスト:

```json
{
  "product_id": "ecaaabb9-b883-4c9d-b457-4fdb0bc1bb02"
}
```

エラー変換:

| Platform error | FCMS response |
| --- | --- |
| `INSUFFICIENT_BALANCE` | `402 INSUFFICIENT_INGOTS` |
| `ALREADY_OWNED` | `409 ALREADY_OWNED` |
| `CURRENCY_PRICE_NOT_FOUND` | `503 PRODUCT_NOT_CONFIGURED` |
| `INVALID_PRODUCT` | `400 INVALID_PRODUCT` |
| 5xx/timeout | `502 PLATFORM_UNAVAILABLE` |

成功時は、Platformレスポンスの `granted_items` からFCMS D1を即時同期する。

`grant_type = entitlement` の場合:

- `item_ref_id` をSKUとして扱う。
- SKUから `piece_master.piece_id` を引く。
- `inventory_item_id` はPlatform実装上 entitlement_id として返るため、`user_pieces_v2.entitlement_id` に保存する。

その後、webhookで同じ `entitlement.created` が来ても `INSERT OR IGNORE` / UPDATEで冪等にする。

### 6.5 Webhook同期を確認

対象: `src/api/webhooks.ts`

最低限必要なイベント:

- `currency.granted`
- `currency.revoked`
- `entitlement.created`
- `entitlement.revoked`

FCMSが `inventory_item` grantへ移行する場合は、次も実装する:

- `inventory.granted`
- `inventory.revoked`

現時点のFCMSコマ所持は `user_pieces_v2` なので、まずは `entitlement` grant継続が安全。

### 6.6 テスト追加

対象:

- `src/api/__tests__/shop.test.ts`
- `src/api/__tests__/webhooks.test.ts`

追加ケース:

- `GET /api/shop/wallet` がPlatform残高を返す。
- Platform残高APIが落ちた場合に502を返す。
- `POST /api/shop/purchase` が `product_id` でPlatform `items/purchase` を呼ぶ。
- `piece_id` 互換入力をPlatform productへ解決できる。
- `INSUFFICIENT_BALANCE` が `INSUFFICIENT_INGOTS` になる。
- `ALREADY_OWNED` が409になる。
- 成功レスポンスの `granted_items` で `user_pieces_v2` が更新される。
- 同じ `entitlement.created` webhookが後着しても二重付与/エラーにならない。

## 7. 環境変数/Secrets

FCMS Worker:

```text
PLATFORM_API_BASE=https://fc-platform-api.yanagiho.workers.dev
PLATFORM_GAME_ID=football_chess_maniacs
GAME_CLIENT_URL=https://football-chess-maniacs.pages.dev
CORS_ORIGIN=https://football-chess-maniacs.pages.dev,https://universo-futbol.com,https://www.universo-futbol.com
```

FCMS Worker secrets:

```text
PLATFORM_GAME_SERVER_TOKEN=<gfp_...>
PLATFORM_HMAC_SECRET=<platform webhook shared secret>
JWT_SECRET=<existing value if used by current auth middleware>
```

Platform側:

- FCMSの戻り先originを `ALLOWED_RETURN_URL_ORIGINS` に追加する。
- FCMS webhook URLをPlatform webhook targetへ登録する。

推奨Webhook URL:

```text
https://football-chess-maniacs.yanagiho.workers.dev/webhook/purchase
```

## 8. デプロイ順

1. Platform側に `product_currency_prices` 登録手段を用意する。
2. Platform側にentitlement重複購入防止を入れる。
3. Platform側のINGOT専売公開条件を修正する。
4. Platform APIをデプロイする。
5. Platform DBへFCMS INGOTパックを登録する。
6. Platform DBへFCMS賞品とINGOT価格/grantを登録する。
7. `fcms_piece_001` など既存piece商品の通常Stripe priceを無効化する。
8. FCMS側で `GET /api/shop/wallet` と `POST /api/shop/purchase` をPlatform経由に変更する。
9. FCMSテストを通す。
10. FCMS Worker secretsを設定する。
11. FCMS Workerをデプロイする。
12. FCMS Pagesをデプロイする。
13. 本番スモークテストを実施する。

## 9. 検証手順

### 9.1 静的検証

```bash
npx tsc --noEmit
npm test
npm run build
```

### 9.2 Platform商品確認

```bash
curl -sS 'https://fc-platform-api.yanagiho.workers.dev/v1/commerce/products?game_id=football_chess_maniacs&sale_status=on_sale' | jq '
  {
    count: (.items | length),
    missing_currency_prices: [.items[] | select((.currency_prices // []) | length == 0) | .slug],
    items: [.items[] | {slug, product_type, sale_status, currency_prices, prices, metadata}]
  }
'
```

合格条件:

- FCMS piece商品に `currency_prices` がある。
- FCMS piece商品に通常 `prices` が残っていない、または購入API側で現金直買い不可になっている。
- INGOT pack商品には通常 `prices` と `currency` grantがある。

### 9.3 SSO確認

UniversoFutbolからFCMSを起動し、URL fragment `#uf_sso=...` が消費されることを確認する。

ブラウザlocalStorage:

```text
fcms_token
fcms_refresh_token
```

### 9.4 INGOT購入確認

1. FCMS Shopを開く。
2. INGOT購入ボタンを押す。
3. Stripe Checkoutへ遷移する。
4. テストカードで決済する。
5. FCMSへ戻る。
6. Platform `game_currency_balances` にINGOTが増えていることを確認する。
7. FCMS Shopの残高表示が増えていることを確認する。

### 9.5 FCMS賞品購入確認

1. INGOT残高が十分あるユーザーでShopを開く。
2. 未所持コマを購入する。
3. FCMS APIがPlatform `items/purchase` を呼ぶ。
4. Platform残高が減る。
5. `user_pieces_v2` に該当コマが入る。
6. 同じコマの再購入が409になる。
7. 残高不足ユーザーでは402になる。

## 10. ロールバック

### 10.1 FCMS側

- 新しい `POST /api/shop/purchase` を無効化し、Shop購入ボタンを一時的にdisabledにする。
- INGOT購入導線だけ残す場合は `POST /api/shop/ingots` のみ運用する。
- `GET /api/shop/catalog` はD1由来一覧表示へ戻せるよう、Platform商品取得失敗時は `platform_configured=false` で返す。

### 10.2 Platform側

- FCMS piece商品を `suspended` にする。
- INGOT pack商品を `suspended` にする。
- Webhook targetを一時停止する。

INGOT残高はPlatform台帳を正とし、FCMS D1の `user_wallets` は復旧判断の根拠にしない。

## 11. 注意点

- FCMS賞品はINGOT購入仕様なので、piece商品のStripe直買いは残さない。
- `currency_price` がない商品は購入不可として扱う。
- `entitlement` grantの二重購入防止はINGOT減算前に必ず行う。
- webhookは遅延/重複する前提で、FCMS側は冪等に処理する。
- Platform障害時にFCMS D1残高で購入を続行すると台帳不一致になるため、購入処理は必ずPlatform成功を条件にする。
- `football-chess-next` は別ゲームなので参照/変更しない。
