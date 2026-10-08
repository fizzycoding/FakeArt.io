import { isMuted, onMuteChange } from './audio';

const VOLUME = 0.12;

let audio: HTMLAudioElement | null = null;

/**
 * Starts the looping background music at a low volume. Browsers only allow
 * audio after the player interacts with the page, so playback begins on the
 * first click, tap or key press.
 */
export const startBackgroundMusic = (): void => {
  if (audio) return;

  audio = new Audio(`${import.meta.env.BASE_URL}music.mp3`);
  audio.loop = true;
  audio.volume = VOLUME;
  // Silenced while CrazyGames asks for it or a video ad is playing.
  audio.muted = isMuted();
  onMuteChange(() => {
    if (audio) audio.muted = isMuted();
  });

  const tryPlay = () => {
    audio?.play().then(removeListeners).catch(() => {});
  };
  const removeListeners = () => {
    window.removeEventListener('pointerdown', tryPlay);
    window.removeEventListener('keydown', tryPlay);
  };
  window.addEventListener('pointerdown', tryPlay);
  window.addEventListener('keydown', tryPlay);

  // Don't keep playing when the player switches tabs or minimises the game.
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.pause();
    else if (audio.currentTime > 0) audio.play().catch(() => {});
  });
};
