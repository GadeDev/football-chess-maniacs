# FCMS Monetization Integration Audit - 2026-07-04

## Scope

Source instruction: `/Users/yanagiho-mba/Downloads/files 4/19_fcms_monetization_codex.md`.

FCMS must use Universo Futbol Platform as the billing and entitlement source of truth. FCMS must not implement Stripe/KOMOJU directly or hard-code tier prices.

## Data Sources

- `docs/lore/characters_200.csv`: canonical 200-character roster.
- `scripts/generate_seed.ts`: transforms the roster into `piece_master` seed SQL.
- `scripts/piece_master_seed.sql`: generated `piece_master` seed with 200 inserts.
- `src/types/piece.ts`: Founding Eleven IDs and piece/SKU helpers.
- `public/assets/pieces/`: rank/position piece sprites, not one image per catalog item.
- Other monetization candidate identified: formation save slot, exported as `formation_save_slot`.

## Existing Platform Integration Inventory

| Area | Status | Notes |
|---|---|---|
| JWT verification | Implemented | `src/middleware/jwt_verify.ts` verifies Platform JWKS for REST Bearer tokens. |
| Client token handling | Not compliant | `src/client/platform/tokenStore.ts` still stores JWTs in `localStorage`; full httpOnly Cookie migration requires an FCMS server auth facade and WebSocket auth redesign. |
| Catalog display | Implemented, adjusted | `GET /api/shop/catalog` reads `piece_master`; now also returns Platform `item_id`. |
| Purchase flow | Adjusted in UI | Shop UI now links to Platform shop with `game_id` and `item_id`; no in-game checkout UI. |
| Legacy INGOT purchase API | Still present | `src/api/shop.ts` retains wallet/INGOT endpoints for compatibility; current Shop UI no longer calls them. |
| Entitlement Webhook | Implemented, adjusted | `POST /webhook/purchase` verifies HMAC, claims delivery ID, is idempotent, and now resolves `metadata.item_id` / `data.item_id` before legacy SKU fallback. |
| user_pieces sync | Implemented, adjusted | `POST /api/pieces/sync` now accepts `item_id` / `metadata.item_id` before legacy SKU fallback. |
| Formation save slots | Implemented server-side | Buyout SKU unlocks 10 slots; global subscription `uf_subscription_monthly_premium` unlocks base 1 + configured bonus 3 slots. Expired higher slots remain readable but read-only. |
| Frontend save-slot route | Partially implemented | Formation screen exposes a Platform shop link for `formation_save_slot`; the screen still uses local slot state rather than `/api/teams`. |

## Old Pricing Model Assumptions Found

- `src/api/shop.ts` still contains INGOT wallet, INGOT product, and `items/purchase` code paths.
- `src/types/piece.ts` still exposes `pieceCostToIngots` for legacy callers/tests.
- `docs/fcms_ingot_platform_service_runbook.md` documents the old INGOT service path.
- Older Platform product matching in `src/api/shop.ts` maps per-piece products by `sku`; tier checkout should instead pass the chosen item through metadata.

## Platform-Side TODOs

- Confirm/register Platform tier products: `tier_s`, `tier_a`, `tier_b`, `tier_c`.
- Ensure Platform checkout writes `metadata.game_id=football_chess_maniacs` and `metadata.item_id` such as `piece_042` or `formation_save_slot`.
- Confirm Platform shop supports `https://universo-futbol.com/shop?game_id=football_chess_maniacs&item_id=...`.
- Add or confirm FCMS webhook endpoint registration for `POST /webhook/purchase`.
- Complete httpOnly Cookie auth architecture outside this change; current Platform API still returns tokens to JS clients and FCMS WebSockets currently depend on token-bearing connection parameters.

## Verification

- `npm run export:catalog`
- `output/catalog_candidates_fcms.csv`: 200 `category=piece` rows plus 1 `save_slot` row.
- `npm test -- src/api/__tests__/webhooks.test.ts src/api/__tests__/team.test.ts src/api/__tests__/shop.test.ts`
- `npm run build`
- `npm test`
