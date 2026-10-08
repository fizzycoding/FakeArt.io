import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSdkMuted, isUserMuted, onMuteChange, setMuted } from '../utils/audio';
import { saveSoundMuted } from '../utils/crazygames';

/** A speaker button, always in the bottom-left corner, that mutes or unmutes all game sound. */
export default function SoundToggle() {
  const [, refresh] = useState(0);
  useEffect(() => {
    // Re-render whenever any mute reason changes (our own click, CrazyGames, an ad).
    const stop = onMuteChange(() => refresh((n) => n + 1));
    return () => {
      stop();
    };
  }, []);

  const userMuted = isUserMuted();
  const platformMuted = isSdkMuted(); // CrazyGames asked for silence; the player can't override it
  const showMuted = userMuted || platformMuted;

  const toggle = () => {
    if (platformMuted) return;
    const next = !userMuted;
    setMuted('user', next);
    saveSoundMuted(next);
  };

  return (
    <div className="absolute bottom-5 left-5 z-[45]">
      <button
        onClick={toggle}
        aria-label={showMuted ? 'Unmute sound' : 'Mute sound'}
        aria-pressed={showMuted}
        title={showMuted ? 'Unmute sound' : 'Mute sound'}
        className="btn btn-secondary btn-sm !p-3 !rounded-full"
      >
        {showMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
      </button>
    </div>
  );
}
