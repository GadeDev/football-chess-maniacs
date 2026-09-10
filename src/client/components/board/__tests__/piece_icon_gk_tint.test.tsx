/* @vitest-environment jsdom */
// GK 識別色（円盤の色相差し替え）の回帰テスト
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PieceIcon from '../PieceIcon';

describe('PieceIcon GK tint', () => {
  afterEach(cleanup);

  it('GK には side ごとの色相オーバーレイ（hue blend）が付く', () => {
    const { container } = render(<PieceIcon cost={2} position="GK" side="ally" />);
    const tint = container.querySelector('[data-testid="gk-tint"]') as SVGElement | null;
    expect(tint).not.toBeNull();
    expect(tint!.style.mixBlendMode).toBe('hue');
    expect(tint!.querySelector('circle')!.getAttribute('fill')).toBe('#14b8a6');

    const { container: enemy } = render(<PieceIcon cost={3} position="GK" side="enemy" />);
    const enemyTint = enemy.querySelector('[data-testid="gk-tint"]')!;
    expect(enemyTint.querySelector('circle')!.getAttribute('fill')).toBe('#f97316');
  });

  it('GK 以外には付かない', () => {
    const { container } = render(<PieceIcon cost={2} position="DF" side="ally" />);
    expect(container.querySelector('[data-testid="gk-tint"]')).toBeNull();
  });
});
