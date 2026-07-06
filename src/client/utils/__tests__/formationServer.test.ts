// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOwnedPieces, saveTeam, activateTeam,
  saveDraft, loadDraft, clearDraft,
  FOUNDING_ELEVEN_FALLBACK,
} from '../formationServer';
import { FOUNDING_ELEVEN_IDS } from '../../../types/piece';

function catalogItem(pieceId: number) {
  return {
    piece_id: pieceId,
    position: 'DF',
    cost: 1,
    name_ja: `キャラ${pieceId}`,
    name_en: `Char ${pieceId}`,
    era: 1,
  };
}

describe('formationServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearDraft();
  });

  describe('fetchOwnedPieces', () => {
    it('ゲスト: カタログからFounding Eleven 11キャラを解決する', async () => {
      const items = [...FOUNDING_ELEVEN_IDS.map(catalogItem), catalogItem(150)];
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify({ items }), { status: 200 })));

      const result = await fetchOwnedPieces(null);
      expect(result).toHaveLength(11);
      expect(result.map(p => p.pieceId).sort((a, b) => a - b))
        .toEqual([...FOUNDING_ELEVEN_IDS].sort((a, b) => a - b));
      expect(result[0].nameJa).toMatch(/^キャラ/);
    });

    it('ゲスト: カタログ取得失敗時はローカルフォールバック', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      const result = await fetchOwnedPieces(null);
      expect(result).toEqual(FOUNDING_ELEVEN_FALLBACK);
    });

    it('ログイン: syncを叩いてから/api/piecesの所持コマを返す', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/api/pieces/sync')) {
          return new Response(JSON.stringify({ synced: 11 }), { status: 200 });
        }
        return new Response(JSON.stringify({ items: [catalogItem(42)] }), { status: 200 });
      }));

      const result = await fetchOwnedPieces('token-1');
      expect(calls.some(u => u.includes('/api/pieces/sync'))).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].pieceId).toBe(42);
    });

    it('ログイン: 一覧が空ならフォールバック（sync失敗時の初回ユーザー保護）', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/pieces/sync')) return new Response('err', { status: 500 });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }));
      const result = await fetchOwnedPieces('token-1');
      expect(result).toEqual(FOUNDING_ELEVEN_FALLBACK);
    });
  });

  describe('saveTeam', () => {
    it('teamIdなしはPOST、403はPREMIUM_REQUIRED', async () => {
      const requests: Array<{ url: string; method?: string }> = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method });
        return new Response(JSON.stringify({ id: 'team_x' }), { status: 201 });
      }));

      const input = {
        slotNumber: 1, name: 'Test', formationPreset: '4-4-2',
        fieldPieces: [], benchPieces: [],
      };
      const ok = await saveTeam('token', input);
      expect(ok).toEqual({ ok: true, teamId: 'team_x' });
      expect(requests[0].method).toBe('POST');

      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
      const denied = await saveTeam('token', input);
      expect(denied).toEqual({ ok: false, error: 'PREMIUM_REQUIRED' });
    });

    it('teamIdありはPUTで上書きする', async () => {
      const requests: Array<{ url: string; method?: string }> = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method });
        return new Response('{}', { status: 200 });
      }));

      const result = await saveTeam('token', {
        teamId: 'team_1', slotNumber: 2, name: 'Test', formationPreset: '3-5-2',
        fieldPieces: [], benchPieces: [],
      });
      expect(result).toEqual({ ok: true, teamId: 'team_1' });
      expect(requests[0].method).toBe('PUT');
      expect(requests[0].url).toContain('/api/teams/team_1');
    });
  });

  describe('activateTeam', () => {
    it('PUT /api/teams/:id/activate を叩き、成功でtrue', async () => {
      const requests: Array<{ url: string; method?: string }> = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method });
        return new Response(JSON.stringify({ active_team_id: 'team_1' }), { status: 200 });
      }));
      expect(await activateTeam('token', 'team_1')).toBe(true);
      expect(requests[0].method).toBe('PUT');
      expect(requests[0].url).toContain('/api/teams/team_1/activate');

      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      expect(await activateTeam('token', 'team_1')).toBe(false);
    });
  });

  describe('draft persistence', () => {
    it('保存→復元のラウンドトリップ', () => {
      expect(loadDraft()).toBeNull();
      const draft = {
        teamName: 'マイチーム',
        presetKey: '4-3-3',
        starters: [{ pieceId: 8, col: 10, row: 1 }],
        bench: [{ pieceId: 42 }],
      };
      saveDraft(draft);
      expect(loadDraft()).toEqual(draft);
    });

    it('壊れたJSONはnull', () => {
      localStorage.setItem('fcms_formation_draft', '{broken');
      expect(loadDraft()).toBeNull();
    });
  });
});
