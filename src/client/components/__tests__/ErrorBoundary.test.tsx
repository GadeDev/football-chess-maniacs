/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

function Bomb({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new TypeError("Cannot read properties of undefined (reading 'x')");
  return <div>alive</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><Bomb explode={false} /></ErrorBoundary>);
    expect(screen.getByText('alive')).toBeTruthy();
  });

  it('shows the error message instead of unmounting the tree, logs it, and records it in sessionStorage', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb explode={true} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getAllByText(/TypeError: Cannot read properties of undefined/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /再読み込み/ })).toBeTruthy();
    expect(err.mock.calls.some((c) => String(c[0]).includes('[ErrorBoundary]'))).toBe(true);
    expect(sessionStorage.getItem('fcms.lastCrash')).toContain('TypeError');
  });
});
