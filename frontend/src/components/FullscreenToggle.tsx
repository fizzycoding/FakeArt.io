import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  isFullscreenSupported,
  isInstalledApp,
  isTouchDevice,
  onFullscreenChange,
} from '../utils/fullscreen';

/** A corner button, next to the speaker, to go fullscreen or leave it. Phones and tablets only. */
export default function FullscreenToggle({ lockLandscape, hidden = false }: { lockLandscape: boolean; hidden?: boolean }) {
  const [full, setFull] = useState(isFullscreen);
  useEffect(() => {
    const stop = onFullscreenChange(() => setFull(isFullscreen()));
    return () => {
      stop();
    };
  }, []);

  if (hidden || !isTouchDevice() || !isFullscreenSupported() || isInstalledApp()) return null;

  const label = full ? 'Exit fullscreen' : 'Go fullscreen';
  return (
    <div className="absolute bottom-5 left-[84px] z-[45]">
      <button
        onClick={() => (full ? exitFullscreen() : enterFullscreen(lockLandscape))}
        aria-label={label}
        title={label}
        className="btn btn-secondary btn-sm !p-3 !rounded-full"
      >
        {full ? <Minimize size={22} /> : <Maximize size={22} />}
      </button>
    </div>
  );
}
