import { describe, expect, it } from 'vitest';
import type { FormationData } from '../../types';
import { resolveLastSetupTeamName, type LastSetup } from '../lastSetup';

function presetSetup(formationData: FormationData): LastSetup {
  return {
    gameMode: 'com',
    comDifficulty: 'regular',
    formationData,
    teamName: '草創期オールスター',
    teamEmoji: 'S1',
    origin: 'preset',
  };
}

describe('resolveLastSetupTeamName', () => {
  it('安定IDから現在ロケールのプリセット名を解決する', () => {
    const setup = presetSetup({
      starters: [],
      bench: [],
      origin: 'preset',
      presetTeamId: 'npc_shelf_1',
    });

    expect(resolveLastSetupTeamName(setup, 'ja')).toBe('草創期オールスター');
    expect(resolveLastSetupTeamName(setup, 'en')).toBe('Dawn All-Stars');
    expect(resolveLastSetupTeamName(setup, 'de')).toBe('Dawn All-Stars');
  });

  it('旧保存データはプリセット駒IDから解決する', () => {
    const setup = presetSetup({
      starters: [{ id: 'preset-npc_shelf_1-5', position: 'GK', cost: 1.5, col: 10, row: 3 }],
      bench: [],
      origin: 'preset',
    });

    expect(resolveLastSetupTeamName(setup, 'en')).toBe('Dawn All-Stars');
  });

  it('自作チーム名はロケールに関係なく保持する', () => {
    const setup: LastSetup = {
      gameMode: 'com',
      comDifficulty: 'regular',
      formationData: null,
      teamName: 'My XI',
      origin: 'custom',
    };

    expect(resolveLastSetupTeamName(setup, 'ja')).toBe('My XI');
    expect(resolveLastSetupTeamName(setup, 'pt')).toBe('My XI');
  });
});
