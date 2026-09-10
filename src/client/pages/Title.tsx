// ============================================================
// Title.tsx — タイトル画面（マイページ）
//
// 2026-09-10 ビジュアル刷新（Owner: 「似たゲームを調べて、まず入れる」）。
// スポーツ／戦術ゲームの定石「ナイトゲームのスタジアム」で構成する:
//   - 背景: 深い紺の空 + 左右上からの照明ビーム（ゆっくり揺れる）+ 遠近をつけた HEX ピッチが霞んで消える
//   - ロゴ: 「FOOTBALL CHESS」小さく字間広め / 「ManiacS」極太斜体・金属質の金グラデ + 光が横切る
//   - 自チームカード: ガラス風パネル、エンブレム周りをゆっくり回る金のリング
//   - 入場: ロゴ → カード → 補助メニューの順に浮き上がる
//   - PC（960px 以上）は左ロゴ / 右カードの 2 カラム、スマホは縦 1 カラム
// 動きはすべて prefers-reduced-motion で止まる。文言・ボタン・遷移先・props は刷新前と同一。
// ============================================================

import React from 'react';
import type { Page } from '../types';
import { type LastSetup, resolveLastSetupTeamName } from '../utils/lastSetup';
import type { ActiveMatchInfo } from '../utils/activeMatch';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';
import { useLocale } from '../i18n/useLocale';

interface TitleProps {
  onNavigate: (page: Page) => void;
  /** 前回の対戦設定（自チームカードの表示に使用） */
  lastSetup?: LastSetup | null;
  /** T11/T12: 「COM対戦」ボタン（編成済みなら前回の編成で、未編成ならランダムNPCチームで即マッチングへ、常にmode='com'固定） */
  onQuickMatch: () => void;
  /** T12: 「ランダム対戦」ボタン（対戦タイプ選択を経由せずオンライン/カジュアルへ直行。未ログイン時はログイン誘導） */
  onQuickOnlineMatch: () => void;
  /** リロード復帰: サーバーで生存確認済みの進行中マッチ（null なら非表示） */
  resumableMatch?: ActiveMatchInfo | null;
  onResumeMatch?: () => void;
  onAbandonMatch?: () => void;
}

/** 背景の HEX ピッチ（flat-top 六角形のタイル。SVG をデータ URL にして背景画像に使う） */
const HEX_PATTERN_URL = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="48" viewBox="0 0 56 48">' +
    '<path d="M14 0 L42 0 L56 24 L42 48 L14 48 L0 24 Z" fill="none" stroke="rgba(140,220,150,0.28)" stroke-width="1"/>' +
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
})();

const TITLE_CSS = `
.fcms-title { position: relative; height: 100%; overflow-y: auto; overflow-x: hidden;
  background: radial-gradient(120% 80% at 50% 0%, #17203f 0%, #0b0f22 45%, #05070f 100%); color: #eee; }
.fcms-title-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.fcms-title-beam { position: absolute; top: -20%; width: 70%; height: 90%; opacity: 0.85;
  filter: blur(2px); transform-origin: top center; }
.fcms-title-beam-l { left: -18%;
  background: radial-gradient(60% 55% at 30% 0%, rgba(255,240,200,0.28) 0%, rgba(255,220,130,0.10) 35%, transparent 70%);
  animation: fcms-beam-sway 9s ease-in-out infinite alternate; }
.fcms-title-beam-r { right: -18%;
  background: radial-gradient(60% 55% at 70% 0%, rgba(210,230,255,0.24) 0%, rgba(150,190,255,0.08) 35%, transparent 70%);
  animation: fcms-beam-sway 11s ease-in-out -4s infinite alternate-reverse; }
.fcms-title-pitch { position: absolute; left: -30%; right: -30%; bottom: -6%; height: 62%;
  background-image: ${HEX_PATTERN_URL}; background-size: 56px 48px;
  transform: perspective(520px) rotateX(58deg); transform-origin: 50% 100%;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.75) 55%, #000 100%);
  mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.75) 55%, #000 100%); }
.fcms-title-pitch::after { content: ''; position: absolute; inset: 0;
  background: radial-gradient(60% 50% at 50% 100%, rgba(60,140,80,0.35), transparent 70%); }
.fcms-title-vignette { position: absolute; inset: 0;
  background: radial-gradient(90% 70% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%); }

.fcms-title-content { position: relative; z-index: 1; min-height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 28px 16px 84px; }
.fcms-title-hero { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.fcms-title-kicker { font-size: clamp(11px, 2.6vw, 14px); font-weight: 800; letter-spacing: 0.42em;
  text-indent: 0.42em; color: rgba(255,236,170,0.85); text-transform: uppercase; }
.fcms-title-logo { font-size: clamp(54px, 15vw, 96px); font-weight: 900; font-style: italic; line-height: 0.95;
  letter-spacing: -0.02em; padding-right: 0.12em;
  background: linear-gradient(110deg, #a8730f 0%, #ffd23f 28%, #fff4c2 46%, #ffd23f 58%, #b7801a 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: #ffd23f;
  filter: drop-shadow(0 4px 0 rgba(120,80,0,0.55)) drop-shadow(0 14px 28px rgba(0,0,0,0.6));
  animation: fcms-logo-shine 5.5s linear infinite; }
.fcms-title-bands { display: flex; gap: 6px; margin-top: 4px; }
.fcms-title-bands i { display: block; height: 4px; border-radius: 2px; transform: skewX(-24deg); }
.fcms-title-bands i:nth-child(1) { width: 64px; background: linear-gradient(90deg, #ffd23f, #ffb300); }
.fcms-title-bands i:nth-child(2) { width: 22px; background: rgba(255,255,255,0.7); }
.fcms-title-bands i:nth-child(3) { width: 10px; background: rgba(255,210,63,0.6); }

.fcms-title-main { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; max-width: 380px; }

.fcms-title-card { width: 100%; border-radius: 22px; padding: 26px 20px 18px;
  display: flex; flex-direction: column; align-items: center;
  background: linear-gradient(160deg, rgba(24,74,40,0.42) 0%, rgba(10,14,34,0.78) 60%, rgba(8,10,28,0.88) 100%);
  border: 1px solid rgba(255,214,0,0.38);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.55), 0 0 42px rgba(255,214,0,0.12);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.fcms-title-emblem-wrap { position: relative; width: 104px; height: 104px; display: grid; place-items: center; }
.fcms-title-emblem-ring { position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(255,214,0,0) 0deg, rgba(255,214,0,0.95) 70deg, rgba(255,214,0,0) 140deg,
    rgba(255,255,255,0.6) 200deg, rgba(255,214,0,0) 250deg, rgba(255,214,0,0.9) 320deg, rgba(255,214,0,0) 360deg);
  -webkit-mask: radial-gradient(circle, transparent 60%, #000 62%, #000 66%, transparent 68%);
  mask: radial-gradient(circle, transparent 60%, #000 62%, #000 66%, transparent 68%);
  animation: fcms-ring-spin 12s linear infinite; }
.fcms-title-emblem { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center;
  font-size: 48px; line-height: 1;
  background: radial-gradient(circle at 35% 30%, rgba(255,214,0,0.30), rgba(255,214,0,0.05) 60%, rgba(0,0,0,0.25) 100%);
  border: 2px solid rgba(255,214,0,0.65);
  box-shadow: 0 0 24px rgba(255,214,0,0.28), inset 0 0 18px rgba(0,0,0,0.35); }
.fcms-title-team { font-size: 21px; font-weight: 900; color: #fff; margin-top: 12px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;
  text-shadow: 0 2px 10px rgba(0,0,0,0.6); }
.fcms-title-summary { font-size: 12px; color: #9cd89c; margin-top: 4px; font-weight: 700; letter-spacing: 0.02em; }

.fcms-title-cta { display: flex; gap: 10px; margin-top: 18px; width: 100%; }
.fcms-title-btn { flex: 1; border-radius: 12px; cursor: pointer; font-weight: 900;
  transition: transform .12s ease, filter .12s ease, box-shadow .12s ease; }
.fcms-title-btn:active { transform: scale(0.97); }
.fcms-title-btn-primary { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: 13px 0; border: none; color: #1a1200; font-size: 15px;
  background: linear-gradient(180deg, #ffe066 0%, #ffc61a 55%, #f0a500 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 18px rgba(255,190,0,0.28), 0 2px 0 #8a5a00; }
.fcms-title-btn-primary:hover { filter: brightness(1.06); transform: translateY(-1px); }
.fcms-title-btn-primary small { font-size: 10px; font-weight: 700; opacity: 0.72; }
.fcms-title-btn-online { display: flex; align-items: center; justify-content: center;
  padding: 13px 0; font-size: 15px; color: #ffd23f;
  background: rgba(255,214,0,0.08); border: 1.5px solid rgba(255,214,0,0.75);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 18px rgba(0,0,0,0.35); }
.fcms-title-btn-online:hover { background: rgba(255,214,0,0.16); transform: translateY(-1px); }
.fcms-title-sub { display: flex; gap: 8px; margin-top: 8px; width: 100%; }
.fcms-title-btn-ghost { padding: 9px 0; font-size: 13px; color: #ddd; border-radius: 10px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.18); }
.fcms-title-btn-ghost:hover { background: rgba(255,255,255,0.12); }
.fcms-title-link { margin-top: 10px; background: none; border: none; color: #8f95a6; font-size: 12px;
  text-decoration: underline; cursor: pointer; }
.fcms-title-link:hover { color: #c9cddb; }

.fcms-title-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%; }
.fcms-title-tile { position: relative; padding: 15px 4px 13px; border-radius: 12px; cursor: pointer;
  border: 1px solid rgba(255,214,0,0.16); background: rgba(255,255,255,0.045); color: #d6d9e3;
  font-size: 12px; font-weight: 800; text-align: center; overflow: hidden;
  transition: background .12s ease, transform .12s ease, border-color .12s ease; }
.fcms-title-tile::before { content: ''; position: absolute; left: 14%; right: 14%; top: 0; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, rgba(255,214,0,0.65), transparent); }
.fcms-title-tile:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,214,0,0.4); transform: translateY(-1px); }
.fcms-title-tile:active { transform: scale(0.97); }
.fcms-title-portal { width: 100%; padding: 9px 0; background: transparent; border: 1px solid rgba(255,215,0,0.25);
  border-radius: 10px; color: #c9a227; font-size: 13px; cursor: pointer; }
.fcms-title-portal:hover { border-color: rgba(255,215,0,0.5); color: #ffd23f; }

.fcms-title-auth { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 12px; margin-top: 6px; }
.fcms-title-auth-btn { padding: 5px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; font-weight: 700; cursor: pointer; }
.fcms-title-auth-btn-login { border-color: rgba(255,214,0,0.55); color: #ffd700; }

.fcms-title-resume { width: 100%; padding: 12px 16px; border-radius: 14px; border: 2px solid #ffd700;
  background: rgba(255,214,0,0.10); box-shadow: 0 0 20px rgba(255,214,0,0.25); display: flex; flex-direction: column; gap: 10px; }

.fcms-fade-up { animation: fcms-fade-up .6s cubic-bezier(.2,.8,.2,1) both; }
.fcms-delay-1 { animation-delay: .12s; }
.fcms-delay-2 { animation-delay: .24s; }
.fcms-delay-3 { animation-delay: .34s; }

@keyframes fcms-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fcms-logo-shine { 0% { background-position: 120% 0; } 100% { background-position: -120% 0; } }
@keyframes fcms-beam-sway { from { transform: rotate(-3deg) translateX(-1%); opacity: 0.7; } to { transform: rotate(3deg) translateX(1%); opacity: 1; } }
@keyframes fcms-ring-spin { to { transform: rotate(360deg); } }

@media (min-width: 960px) {
  .fcms-title-content { flex-direction: row; align-items: center; justify-content: center; gap: 72px; padding: 40px 48px 84px; }
  .fcms-title-hero { align-items: flex-start; text-align: left; flex: 0 1 460px; }
  .fcms-title-kicker { font-size: 16px; }
  .fcms-title-logo { font-size: clamp(96px, 9.5vw, 132px); }
  .fcms-title-auth { justify-content: flex-start; margin-top: 18px; }
  .fcms-title-main { flex: 0 0 400px; max-width: 400px; }
  .fcms-title-pitch { height: 70%; bottom: -10%; }
}
@media (prefers-reduced-motion: reduce) {
  .fcms-title * { animation: none !important; transition: none !important; }
}
`;

export default function Title({ onNavigate, lastSetup, onQuickMatch, onQuickOnlineMatch, resumableMatch, onResumeMatch, onAbandonMatch }: TitleProps) {
  return (
    <div className="fcms-title">
      <style>{TITLE_CSS}</style>

      {/* 背景（装飾のみ。操作を受け取らない） */}
      <div className="fcms-title-bg" aria-hidden="true">
        <div className="fcms-title-beam fcms-title-beam-l" />
        <div className="fcms-title-beam fcms-title-beam-r" />
        <div className="fcms-title-pitch" />
        <div className="fcms-title-vignette" />
      </div>

      <div className="fcms-title-content">
        {/* ロゴブロック（PC では左カラム） */}
        <header className="fcms-title-hero fcms-fade-up">
          <div className="fcms-title-kicker">Football Chess</div>
          <h1 className="fcms-title-logo">ManiacS</h1>
          <div className="fcms-title-bands" aria-hidden="true"><i /><i /><i /></div>
          {/* T10c: ゲスト/ログイン状態表示 + ログイン導線 */}
          <AuthStatusBar />
        </header>

        <div className="fcms-title-main">
          {/* リロード復帰バナー: 進行中の試合がある場合は最上部に目立たせて表示。
              「復帰する」で既存のRECONNECTフローへ、「棄権する」でサーバーに離脱通知して破棄 */}
          {resumableMatch && (
            <div className="fcms-title-resume fcms-fade-up">
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ffd700', textAlign: 'center' }}>
                {t('title.resume_banner')}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onResumeMatch} className="fcms-title-btn fcms-title-btn-primary" style={{ padding: '10px 0', fontSize: 14 }}>
                  {t('title.resume_match')}
                </button>
                <button onClick={onAbandonMatch} className="fcms-title-btn fcms-title-btn-ghost" style={{ fontSize: 13 }}>
                  {t('title.abandon_match')}
                </button>
              </div>
            </div>
          )}

          {/* 自チームカード（マイページハブ）— T12: 試合を始める主入口は「COM対戦」「ランダム対戦」の2大ボタン。
              「対戦へ」は設定を変えたい人向けの控えめなリンクとして残す。T9a: エンブレム/チーム名を主役として中央配置 */}
          <TeamCard lastSetup={lastSetup} onNavigate={onNavigate} onQuickMatch={onQuickMatch} onQuickOnlineMatch={onQuickOnlineMatch} />

          {/* 補助機能（試合フローとは別軸）— T9c: 3列×2行の均等グリッド */}
          <div className="fcms-title-grid fcms-fade-up fcms-delay-2">
            <SubButton label={t('title.shop')} onClick={() => onNavigate('shop')} />
            <SubButton label={t('title.collection')} onClick={() => onNavigate('collection')} />
            <SubButton label={t('title.ranking')} onClick={() => onNavigate('ranking')} />
            <SubButton label={t('title.profile')} onClick={() => onNavigate('profile')} />
            <SubButton label={t('title.replay')} onClick={() => onNavigate('replay')} />
            <SubButton label={t('title.settings')} onClick={() => onNavigate('settings')} />
          </div>

          {/* プラットフォームポータルへの導線（Issue #15）。ブランド名のため原語固定 */}
          <button
            onClick={() => window.open('https://universo-futbol.com', '_blank', 'noopener')}
            className="fcms-title-portal fcms-fade-up fcms-delay-3"
          >
            Universo Fútbol {'↗'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthStatusBar() {
  const { isLoggedIn, requireLogin, logout } = useAuth();

  return (
    <div className="fcms-title-auth">
      <span style={{ color: isLoggedIn ? '#9cd89c' : '#9aa0b4' }}>
        {isLoggedIn ? t('auth.logged_in_as') : t('auth.guest_playing')}
      </span>
      {isLoggedIn ? (
        <button onClick={logout} className="fcms-title-auth-btn">
          {t('auth.logout')}
        </button>
      ) : (
        <button onClick={() => requireLogin()} className="fcms-title-auth-btn fcms-title-auth-btn-login">
          {t('auth.login_cta')}
        </button>
      )}
    </div>
  );
}

function TeamCard({
  lastSetup,
  onNavigate,
  onQuickMatch,
  onQuickOnlineMatch,
}: {
  lastSetup?: LastSetup | null;
  onNavigate: (page: Page) => void;
  onQuickMatch: () => void;
  onQuickOnlineMatch: () => void;
}) {
  const locale = useLocale();
  const teamName = resolveLastSetupTeamName(lastSetup, locale);
  const teamEmoji = lastSetup?.teamEmoji || '⚽';
  const starters = lastSetup?.formationData?.starters ?? [];
  const totalCost = starters.reduce((sum, p) => sum + p.cost, 0);
  // T11: 一度でも編成を確定していれば「前回の編成で」、初回/未編成なら「ランダムなNPCチームで」対戦する
  const isFormed = !!lastSetup?.formationData;

  return (
    <div className="fcms-title-card fcms-fade-up fcms-delay-1">
      {/* T9a: エンブレムを主役サイズで中央配置（回るリング付き） */}
      <div className="fcms-title-emblem-wrap">
        <div className="fcms-title-emblem-ring" aria-hidden="true" />
        <div className="fcms-title-emblem">{teamEmoji}</div>
      </div>
      <div className="fcms-title-team">{teamName}</div>
      <div className="fcms-title-summary">
        {t('team.starters_summary', { count: String(starters.length), cost: String(totalCost) })}
      </div>

      {/* T12: マイページ最上位に同格の大ボタンを2つ配置（COM対戦/ランダム対戦、追加クリックなしで実行可能） */}
      <div className="fcms-title-cta">
        <button onClick={onQuickMatch} className="fcms-title-btn fcms-title-btn-primary">
          <span>{t('team.quick_match_com')}</span>
          <small>{isFormed ? t('team.quick_match_formed_hint') : t('team.quick_match_unformed_hint')}</small>
        </button>
        <button onClick={onQuickOnlineMatch} className="fcms-title-btn fcms-title-btn-online">
          {t('team.quick_match_online')}
        </button>
      </div>

      <div className="fcms-title-sub">
        <button onClick={() => onNavigate('shop')} className="fcms-title-btn fcms-title-btn-ghost">
          {t('title.shop')}
        </button>
        <button onClick={() => onNavigate('formation')} className="fcms-title-btn fcms-title-btn-ghost">
          {t('title.edit_formation')}
        </button>
      </div>
      {/* T12: フレンド対戦・ランク戦・COM観戦・難易度変更など、あえて選びたい人向けの控えめなリンクとして残す */}
      <button onClick={() => onNavigate('modeSelect')} className="fcms-title-link">
        {t('team.go_to_battle')}
      </button>
    </div>
  );
}

function SubButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="fcms-title-tile">
      {label}
    </button>
  );
}
