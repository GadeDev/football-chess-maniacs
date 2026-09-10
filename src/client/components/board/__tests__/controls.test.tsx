/* @vitest-environment jsdom */
// ============================================================
// controls.test.tsx — useControls のドラッグ/パン（Issue #13 回帰テスト）
// ============================================================
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useControls } from '../Controls';

type Transform = { x: number; y: number; scale: number };
type Updater = Transform | ((prev: Transform) => Transform);

function setup() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const containerRef = { current: el } as React.RefObject<HTMLDivElement>;
  // React と同じく、更新関数はその場では評価せず後で（描画時に）評価する
  const queued: Array<(prev: Transform) => Transform> = [];
  const setTransform = vi.fn((u: Updater) => { if (typeof u === 'function') queued.push(u); });
  const transform: Transform = { x: 10, y: 20, scale: 1 };
  const { result } = renderHook(() => useControls({
    containerRef,
    transform,
    setTransform: setTransform as unknown as React.Dispatch<React.SetStateAction<Transform>>,
    boardWidth: 900,
    boardHeight: 1400,
  }));
  return { result, queued, setTransform, transform };
}

const touch = (points: Array<{ clientX: number; clientY: number }>) =>
  ({ touches: points, preventDefault() {} }) as unknown as React.TouchEvent;

describe('useControls ドラッグパン', () => {
  it('touchmove→touchend の後に React が更新関数を評価しても null を読まない（Issue #13 暗転の原因）', () => {
    const { result, queued, transform } = setup();
    act(() => {
      result.current.handleTouchStart(touch([{ clientX: 100, clientY: 100 }]));
      result.current.handleTouchMove(touch([{ clientX: 110, clientY: 105 }])); // 10px ドラッグ
      result.current.handleTouchEnd(); // ← dragRef.current = null
    });
    expect(queued).toHaveLength(1);
    // 旧実装は更新関数内で dragRef.current!.originTx を読むため、ここで TypeError → 全画面消失
    expect(() => queued[0](transform)).not.toThrow();
    expect(queued[0](transform)).toEqual({ x: 20, y: 25, scale: 1 });
    expect(result.current.wasDragging()).toBe(true);
  });

  it('タップの指ぶれ（4px以下）では盤面を動かさず、クリック扱いのまま', () => {
    const { result, setTransform } = setup();
    act(() => {
      result.current.handleTouchStart(touch([{ clientX: 245, clientY: 491 }]));
      result.current.handleTouchMove(touch([{ clientX: 244, clientY: 491 }])); // 実機ログと同じ 1px
      result.current.handleTouchEnd();
    });
    expect(setTransform).not.toHaveBeenCalled();
    expect(result.current.wasDragging()).toBe(false);
  });

  it('PC 中クリックドラッグでも pointerup 後の更新関数評価が安全', () => {
    const { result, queued, transform } = setup();
    const target = { setPointerCapture() {} } as unknown as HTMLElement;
    act(() => {
      result.current.handlePointerDown({ button: 1, clientX: 50, clientY: 50, pointerId: 1, target, preventDefault() {} } as unknown as React.PointerEvent);
      result.current.handlePointerMove({ clientX: 60, clientY: 40 } as unknown as React.PointerEvent);
      result.current.handlePointerUp();
    });
    expect(queued).toHaveLength(1);
    expect(() => queued[0](transform)).not.toThrow();
    expect(queued[0](transform)).toEqual({ x: 20, y: 10, scale: 1 });
  });
});
