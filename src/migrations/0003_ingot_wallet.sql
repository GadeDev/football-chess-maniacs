-- ============================================================
-- 0003_ingot_wallet.sql — インゴット（ゲーム内通貨）ウォレット
-- インゴットはプラットフォーム決済で購入 → Webhook で加算。
-- コマ購入時にFCMS側で減算（サーバー権威）。
-- ============================================================

CREATE TABLE IF NOT EXISTS user_wallets (
  user_id    TEXT PRIMARY KEY,
  ingots     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
