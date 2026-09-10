/* @vitest-environment jsdom */
// タイトル画面（マイページ）: 刷新後も導線・文言・ハンドラが維持されていることの回帰テスト
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isLoggedIn: false, requireLogin: vi.fn(), logout: vi.fn() }),
}));

import Title from '../Title';
import { t } from '../../i18n';

function renderTitle(overrides: Partial<React.ComponentProps<typeof Title>> = {}) {
  const props = {
    onNavigate: vi.fn(),
    onQuickMatch: vi.fn(),
    onQuickOnlineMatch: vi.fn(),
    ...overrides,
  };
  render(<Title {...props} />);
  return props;
}

describe('Title (マイページ)', () => {
  afterEach(cleanup);

  it('ロゴと2大ボタン・補助メニュー6件・ポータル導線を描画する', () => {
    renderTitle();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('ManiacS');
    expect(screen.getByText(t('team.quick_match_com'))).toBeTruthy();
    expect(screen.getByText(t('team.quick_match_online'))).toBeTruthy();
    for (const key of ['title.collection', 'title.ranking', 'title.profile', 'title.replay', 'title.settings']) {
      expect(screen.getByText(t(key))).toBeTruthy();
    }
    expect(screen.getAllByText(t('title.shop')).length).toBeGreaterThanOrEqual(2); // カード内 + グリッド
    expect(screen.getByText(/Universo Fútbol/)).toBeTruthy();
    expect(screen.queryByText(t('title.resume_banner'))).toBeNull();
  });

  it('2大ボタンと編成・対戦へ・グリッドの遷移先が刷新前と同じ', () => {
    const props = renderTitle();
    fireEvent.click(screen.getByText(t('team.quick_match_com')));
    expect(props.onQuickMatch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(t('team.quick_match_online')));
    expect(props.onQuickOnlineMatch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(t('title.edit_formation')));
    expect(props.onNavigate).toHaveBeenLastCalledWith('formation');
    fireEvent.click(screen.getByText(t('team.go_to_battle')));
    expect(props.onNavigate).toHaveBeenLastCalledWith('modeSelect');
    fireEvent.click(screen.getByText(t('title.ranking')));
    expect(props.onNavigate).toHaveBeenLastCalledWith('ranking');
    fireEvent.click(screen.getByText(t('title.settings')));
    expect(props.onNavigate).toHaveBeenLastCalledWith('settings');
  });

  it('進行中マッチがあれば復帰バナーを出し、復帰/棄権を呼ぶ', () => {
    const onResumeMatch = vi.fn();
    const onAbandonMatch = vi.fn();
    renderTitle({
      resumableMatch: { matchId: 'casual_x', team: 'home', savedAt: Date.now() } as never,
      onResumeMatch,
      onAbandonMatch,
    });
    expect(screen.getByText(t('title.resume_banner'))).toBeTruthy();
    fireEvent.click(screen.getByText(t('title.resume_match')));
    expect(onResumeMatch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(t('title.abandon_match')));
    expect(onAbandonMatch).toHaveBeenCalledTimes(1);
  });
});
