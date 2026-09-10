/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';

describe('diagPanel smoke', () => {
  it('installs with ?fcmsdebug=1, samples, and logs a click without throwing', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/?fcmsdebug=1');
    (window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;
    (window as unknown as { AudioContext: unknown }).AudioContext = class { state = 'suspended'; };
    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', zIndex: '200', animation: 'fcms-backdrop-in 250ms' });
    document.body.appendChild(overlay);
    const { installDiagPanelIfRequested } = await import('../diagPanel');
    installDiagPanelIfRequested();
    const panel = document.getElementById('fcms-diag-panel');
    expect(panel).not.toBeNull();
    new (window as unknown as { AudioContext: new () => unknown }).AudioContext();
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }));
    console.log('[Battle] smoke log');
    vi.advanceTimersByTime(600);
    const text = panel!.querySelector('pre')!.textContent ?? '';
    expect(text).toContain('FCMS DIAG v1');
    expect(text).toContain('audio: #1=suspended');
    expect(text).toContain('click @10,20');
    expect(text).toContain('[Battle] smoke log');
    vi.useRealTimers();
  });
});

describe('diagPanel persistence', () => {
  it('URL に fcmsdebug が無く、通常ナビゲーションで開いた場合は前回の記憶があっても出さない（記憶も消す）', async () => {
    document.getElementById('fcms-diag-panel')?.remove();
    sessionStorage.setItem('fcms.debug', '1');
    window.history.replaceState({}, '', '/');
    (window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;
    // jsdom には navigation entry が無い → carriedOver=false と同じ扱い
    const { installDiagPanelIfRequested } = await import('../diagPanel');
    installDiagPanelIfRequested();
    expect(document.getElementById('fcms-diag-panel')).toBeNull();
    expect(sessionStorage.getItem('fcms.debug')).toBeNull();
  });
});
