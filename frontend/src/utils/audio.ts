// One place that decides whether the game may make sound. Music and sound
// effects both obey it. Sound is muted whenever ANY reason is active:
//   "sdk" - CrazyGames asked for it (game.settings.muteAudio)
//   "ad"  - a video ad is playing
//   "user" - the player pressed the speaker button
export type MuteReason = 'sdk' | 'ad' | 'user';

const reasons = new Set<MuteReason>();
const listeners = new Set<() => void>();

export const setMuted = (reason: MuteReason, muted: boolean): void => {
  const changed = muted ? !reasons.has(reason) : reasons.delete(reason);
  if (muted) reasons.add(reason);
  if (changed) listeners.forEach((fn) => fn());
};

export const isMuted = (): boolean => reasons.size > 0;
export const isUserMuted = (): boolean => reasons.has('user');
export const isSdkMuted = (): boolean => reasons.has('sdk');

export const onMuteChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
