// Sound effects, synthesised with the Web Audio API so no audio files are
// needed. Everything is short and quiet so it sits under the background music.

import { isMuted } from './audio';

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

interface Tone {
  freq: number;
  /** Pitch to glide to over the note's length. */
  to?: number;
  /** Seconds after the call before the note starts. */
  at?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
}

const play = (tones: Tone[]): void => {
  if (isMuted()) return;
  const c = getCtx();
  if (!c || c.state !== 'running') return;

  for (const t of tones) {
    const start = c.currentTime + (t.at ?? 0);
    const dur = t.dur ?? 0.12;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + dur);

    const peak = t.vol ?? 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
};

export const sfx = {
  click: () => play([{ freq: 620, to: 400, dur: 0.07, type: 'triangle', vol: 0.12 }]),
  tick: () => play([{ freq: 880, dur: 0.05, type: 'square', vol: 0.05 }]),
  blip: () => play([{ freq: 700, to: 900, dur: 0.08, type: 'sine', vol: 0.09 }]),
  message: () => play([{ freq: 520, dur: 0.06, type: 'sine', vol: 0.08 }, { freq: 780, at: 0.06, dur: 0.08, type: 'sine', vol: 0.08 }]),
  playerLeft: () => play([{ freq: 440, to: 260, dur: 0.18, type: 'triangle', vol: 0.1 }]),
  voteCast: () => play([{ freq: 440, dur: 0.07, type: 'triangle' }, { freq: 660, at: 0.07, dur: 0.14, type: 'triangle' }]),
  yourTurn: () => play([{ freq: 660, dur: 0.1, type: 'sine' }, { freq: 880, at: 0.1, dur: 0.1, type: 'sine' }, { freq: 1100, at: 0.2, dur: 0.18, type: 'sine' }]),
  matchFound: () => play([
    { freq: 523, dur: 0.14, type: 'triangle' },
    { freq: 659, at: 0.12, dur: 0.14, type: 'triangle' },
    { freq: 784, at: 0.24, dur: 0.3, type: 'triangle' },
  ]),
  roundStart: () => play([{ freq: 392, to: 784, dur: 0.3, type: 'sawtooth', vol: 0.06 }, { freq: 784, at: 0.3, dur: 0.18, type: 'triangle' }]),
  votingStart: () => play([{ freq: 330, dur: 0.12, type: 'triangle' }, { freq: 330, at: 0.18, dur: 0.12, type: 'triangle' }, { freq: 494, at: 0.36, dur: 0.22, type: 'triangle' }]),
  roundEnd: () => play([{ freq: 494, dur: 0.14, type: 'triangle' }, { freq: 392, at: 0.14, dur: 0.14, type: 'triangle' }, { freq: 330, at: 0.28, dur: 0.28, type: 'triangle' }]),
  victory: () => play([
    { freq: 523, dur: 0.14, type: 'triangle' },
    { freq: 659, at: 0.14, dur: 0.14, type: 'triangle' },
    { freq: 784, at: 0.28, dur: 0.14, type: 'triangle' },
    { freq: 1047, at: 0.42, dur: 0.5, type: 'triangle' },
  ]),
};

/** Unlocks audio on the first tap and clicks on every enabled button. */
export const initSfx = (): void => {
  document.addEventListener(
    'pointerdown',
    (e) => {
      getCtx();
      const target = e.target as Element | null;
      const button = target?.closest?.('button');
      if (button && !(button as HTMLButtonElement).disabled) sfx.click();
    },
    true,
  );
};
