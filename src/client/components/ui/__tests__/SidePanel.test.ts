import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../../i18n';
import { formatActionLabel, formatEvent, formatShootOutcome } from '../SidePanel';

afterEach(() => setLocale('ja'));

describe('SidePanel event localization', () => {
  it('jaでは移行前のシュート結果トークンを維持する', () => {
    setLocale('ja');
    expect(formatShootOutcome('saved_ck')).toBe('saved_ck');
    expect(formatEvent({ type: 'LOOSE_BALL', phase: 2 })).toBe('LOOSE_BALL');
  });

  it('英語では内部outcomeを表示用ラベルへ変換する', () => {
    setLocale('en');
    expect(formatEvent({
      type: 'SHOOT',
      phase: 2,
      result: { outcome: 'saved_ck' },
    })).toContain('saved for a corner');
  });

  it('他言語でイベント型や内部outcomeを露出しない', () => {
    setLocale('de');
    expect(formatShootOutcome('blocked')).toBe('geblockt');

    setLocale('ko');
    expect(formatEvent({ type: 'LOOSE_BALL', phase: 1 })).toBe('루즈 볼');

    setLocale('zh-CN');
    expect(formatEvent({ type: 'FUTURE_EVENT', phase: 1 })).toBe('未知事件');
  });

  it('スルーパスの内部action名を表示用ラベルへ変換する', () => {
    setLocale('ja');
    expect(formatActionLabel('throughPass')).toBe('throughPass');

    setLocale('es');
    expect(formatActionLabel('throughPass')).toBe('Pase al espacio');
    expect(formatActionLabel('futureAction')).toBe('Acción desconocida');
  });
});
