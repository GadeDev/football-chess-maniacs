// ============================================================
// ShopScreen.tsx — ショップ画面（B2）
// コマ購入は Universo Futbol Platform ショップへ委譲する。
// ============================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { apiUrl, type Page, type Position, type Cost } from '../types';
import { costToDisplay } from '../../types/piece';
import PieceIcon from '../components/board/PieceIcon';
import BackButton from '../components/ui/BackButton';
import HeaderBack from '../components/ui/HeaderBack';
import { t } from '../i18n';
import { useLocale } from '../i18n/useLocale';
import { buildPlatformShopUrl } from '../platform/config';
import { LEGAL_TERMS_APPLICABILITY_KEY } from '../components/LegalFooter';

interface ShopScreenProps {
  onNavigate: (page: Page) => void;
  authToken?: string;
}

const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];

// コスト表示は src/types/piece.ts の正本（costToDisplay）を使用する。

interface CatalogItem {
  pieceId: number;
  itemId: string;
  nameJa: string;
  nameEn: string;
  position: Position;
  cost: Cost;
  imageUrl?: string;
  owned: boolean;
}

interface RawCatalogItem {
  piece_id: number;
  item_id?: string;
  name_ja?: string;
  name_en?: string;
  position: string;
  cost: number;
  image_url?: string | null;
  is_owned?: boolean;
}

/** バックエンド未接続時のローカルカタログ（開発・デモ用） */
function buildFallbackCatalog(): CatalogItem[] {
  const costs: Cost[] = [1, 1.5, 2, 2.5, 3];
  const items: CatalogItem[] = [];
  let id = 1;
  for (const pos of ALL_POSITIONS) {
    for (const cost of costs) {
      items.push({
        pieceId: id++,
        itemId: `piece_${String(id - 1).padStart(3, '0')}`,
        nameJa: `${pos} ${costToDisplay(cost)}`,
        nameEn: `${pos} ${costToDisplay(cost)}`,
        position: pos,
        cost,
        owned: false,
      });
    }
  }
  return items;
}

export default function ShopScreen({ onNavigate, authToken }: ShopScreenProps) {
  const locale = useLocale();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [toast, setToast] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  // カタログ取得（API → 失敗時フォールバック）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/shop/catalog?limit=200'), { headers: authHeaders });
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as { items: RawCatalogItem[] };
        if (cancelled) return;
        const mapped: CatalogItem[] = data.items.map((r) => ({
          pieceId: r.piece_id,
          itemId: r.item_id ?? `piece_${String(r.piece_id).padStart(3, '0')}`,
          nameJa: r.name_ja || r.name_en || `${r.position} ${r.cost}`,
          nameEn: r.name_en || r.name_ja || `${r.position} ${r.cost}`,
          position: r.position.toUpperCase() as Position,
          cost: r.cost as Cost,
          imageUrl: r.image_url ?? undefined,
          owned: Boolean(r.is_owned),
        }));
        setCatalog(mapped);
      } catch {
        if (!cancelled) setCatalog(buildFallbackCatalog());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const handleOpenPlatformShop = useCallback((itemId?: string) => {
    window.location.href = buildPlatformShopUrl(itemId);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(
    () => (posFilter === 'ALL' ? catalog : catalog.filter((c) => c.position === posFilter)),
    [catalog, posFilter],
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* ヘッダー: タイトル + Platformショップ導線（BackButtonはスクロール領域の外＝画面下部に固定配置） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 460, alignItems: 'center', padding: '20px 16px 0' }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>{t('screen.shop')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => handleOpenPlatformShop()} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: 'linear-gradient(135deg, #4a9eff, #2563eb)',
            color: '#fff', fontSize: 13, fontWeight: 'bold',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t('shop.open_platform')}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#7a86a8', width: '100%', maxWidth: 460, padding: '8px 16px 0' }}>
        {t('shop.description')}
      </div>
      <div style={{ fontSize: 10, lineHeight: 1.5, color: '#6f7894', width: '100%', maxWidth: 460, padding: '6px 16px 0' }}>
        {t(LEGAL_TERMS_APPLICABILITY_KEY)}
      </div>

      {/* ポジションフィルター */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', maxWidth: 460, padding: '8px 16px 0' }}>
        {(['ALL', ...ALL_POSITIONS] as const).map((pos) => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: posFilter === pos ? '1px solid #4a9eff' : '1px solid rgba(255,255,255,0.1)',
            background: posFilter === pos ? 'rgba(74,158,255,0.2)' : 'transparent',
            color: posFilter === pos ? '#9ecbff' : '#888', fontWeight: posFilter === pos ? 'bold' : 'normal',
          }}>
            {pos === 'ALL' ? t('shop.filter_all') : pos}
          </button>
        ))}
      </div>

      {/* スクロール可能領域: コマカタログ。BackButtonはこの外（画面下部）に固定配置 */}
      <div style={{
        flex: 1, overflowY: 'auto', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 16px 16px',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10, width: '100%', maxWidth: 460,
        }}>
          {visible.map((item) => {
            const isSS = item.cost >= 2.5;
            const canBuy = !item.owned;
            return (
              <div key={item.pieceId} style={{
                background: isSS ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.04)',
                border: isSS ? '1px solid rgba(255,215,0,0.35)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <PieceIcon cost={item.cost} position={item.position} side="ally" />
                <div style={{ fontSize: 12, color: '#ddd', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2 }}>
                  {locale === 'ja' ? item.nameJa : item.nameEn}
                </div>
                <div style={{ fontSize: 11, color: isSS ? '#ffd700' : '#8aa', }}>
                  {item.position} · {costToDisplay(item.cost)}
                </div>
                {item.owned ? (
                  <div style={{
                    marginTop: 2, padding: '7px 0', width: '100%', textAlign: 'center',
                    borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: '#888',
                    fontSize: 12, fontWeight: 'bold',
                  }}>
                    {t('shop.owned')}
                  </div>
                ) : (
                  <button onClick={() => handleOpenPlatformShop(item.itemId)} disabled={!canBuy} style={{
                    marginTop: 2, padding: '7px 0', width: '100%',
                    borderRadius: 8, border: 'none',
                    background: canBuy ? (isSS ? '#cc9a00' : '#2563eb') : '#333',
                    color: canBuy ? '#fff' : '#666',
                    fontSize: 12, fontWeight: 'bold', cursor: canBuy ? 'pointer' : 'default',
                  }}>
                    {t('shop.buy_on_platform')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div style={{ color: '#666', fontSize: 13, padding: 32 }}>{t('shop.loading')}</div>
        )}
      </div>

      <HeaderBack onClick={() => onNavigate('title')} />

      <BackButton onClick={() => onNavigate('title')} />

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, zIndex: 310, border: '1px solid rgba(255,255,255,0.15)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
