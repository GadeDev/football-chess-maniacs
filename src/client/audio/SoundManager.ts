// ============================================================
// SoundManager.ts — サウンド管理（C8）
// Web Audio API でビープ音を生成。外部ファイル不要。
// SettingsContext と連動（bgm/sfx ON/OFF, volume）
// ============================================================

type SoundId =
  | 'whistle_start' | 'whistle_end' | 'goal' | 'shoot' | 'pass'
  | 'tackle' | 'foul' | 'card' | 'click' | 'turn_confirm'
  | 'timer_warning' | 'pk_goal' | 'pk_save';

interface SoundDef {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  freq?: number;
  duration: number;
  gain?: number;
}

/** 環境音BGMの基準ゲイン（volume設定と乗算） */
const AMBIENCE_GAIN = 0.055;

const SOUND_DEFS: Record<SoundId, SoundDef> = {
  whistle_start:  { type: 'sine', freq: 2200, duration: 0.3, gain: 0.3 },
  whistle_end:    { type: 'sine', freq: 2200, duration: 0.8, gain: 0.3 },
  goal:           { type: 'noise', duration: 1.0, gain: 0.25 },
  shoot:          { type: 'triangle', freq: 300, duration: 0.15, gain: 0.4 },
  pass:           { type: 'sine', freq: 600, duration: 0.1, gain: 0.2 },
  tackle:         { type: 'square', freq: 150, duration: 0.15, gain: 0.3 },
  foul:           { type: 'sine', freq: 1800, duration: 0.4, gain: 0.25 },
  card:           { type: 'sawtooth', freq: 800, duration: 0.2, gain: 0.2 },
  click:          { type: 'sine', freq: 1000, duration: 0.05, gain: 0.15 },
  turn_confirm:   { type: 'sine', freq: 880, duration: 0.15, gain: 0.2 },
  timer_warning:  { type: 'square', freq: 1200, duration: 0.3, gain: 0.3 },
  pk_goal:        { type: 'noise', duration: 0.5, gain: 0.2 },
  pk_save:        { type: 'triangle', freq: 400, duration: 0.3, gain: 0.25 },
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.8;
  private bgmEnabled = true;
  private ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol / 100));
    // 再生中の環境音にも即時反映
    if (this.ambience && this.ctx) {
      this.ambience.gain.gain.setTargetAtTime(AMBIENCE_GAIN * this.volume, this.ctx.currentTime, 0.1);
    }
  }

  setBgmEnabled(enabled: boolean) {
    this.bgmEnabled = enabled;
    if (!enabled) this.stopAmbience();
  }

  /**
   * BGM: スタジアム環境音（群衆のざわめき）のループ再生。試合中のみ流す。
   * 外部音源ファイル不要（バンドパスノイズ+ゆったりした音量ゆらぎを合成）
   */
  startAmbience() {
    if (!this.bgmEnabled || this.ambience) return;
    try {
      const ctx = this.getCtx();
      const dur = 6; // 6秒ループ（ゆらぎ周期と一致させて継ぎ目を目立たせない）
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        // ざわめき: ノイズ × ループ周期のゆらぎ（sin^2で端点=0にしてループの継ぎ目を消す）
        const sway = 0.6 + 0.4 * Math.sin((Math.PI * i) / data.length) ** 2;
        data[i] = (Math.random() * 2 - 1) * sway;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 550; band.Q.value = 0.4;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = 1600;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, AMBIENCE_GAIN * this.volume), ctx.currentTime + 1.2);
      src.connect(band).connect(low).connect(gain).connect(ctx.destination);
      src.start();
      this.ambience = { src, gain };
    } catch {
      // Audio not available
    }
  }

  stopAmbience() {
    if (!this.ambience || !this.ctx) return;
    const { src, gain } = this.ambience;
    this.ambience = null;
    try {
      const t = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0.001, t, 0.25);
      src.stop(t + 1);
    } catch {
      // 既に停止済み等は無視
    }
  }

  /** ゴール演出用の歓声スウェル（バンドパスノイズのフェードイン→アウト）
   *  delaySec: GoalCeremonyのタメ(TAME_MS=320ms)と同期し、着弾の瞬間に歓声が爆発する */
  playGoalCelebration(durationSec = 2.4, delaySec = 0.32) {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const t = ctx.currentTime + delaySec;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSec), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.35;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = 2600;
      const gain = ctx.createGain();
      const peak = 0.4 * this.volume;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.18);
      gain.gain.setValueAtTime(peak, t + durationSec * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
      src.connect(band).connect(low).connect(gain).connect(ctx.destination);
      src.start(t);
      src.stop(t + durationSec);
    } catch {
      // Audio not available
    }
  }

  play(id: SoundId) {
    if (!this.enabled) return;
    const def = SOUND_DEFS[id];
    if (!def) return;

    try {
      const ctx = this.getCtx();
      const gain = ctx.createGain();
      gain.gain.value = (def.gain ?? 0.2) * this.volume;
      gain.connect(ctx.destination);

      // フェードアウト
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + def.duration);

      if (def.type === 'noise') {
        // ホワイトノイズ
        const bufferSize = ctx.sampleRate * def.duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        src.start();
        src.stop(ctx.currentTime + def.duration);
      } else {
        const osc = ctx.createOscillator();
        osc.type = def.type;
        osc.frequency.value = def.freq ?? 440;
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + def.duration);
      }
    } catch {
      // Audio not available
    }
  }
}

/** シングルトンインスタンス */
export const soundManager = new SoundManager();
