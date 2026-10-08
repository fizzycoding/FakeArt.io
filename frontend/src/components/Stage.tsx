import { ReactNode, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';

// Everything in the app is laid out on one fixed-size stage that is scaled to
// fit the window, so a laptop and a phone held sideways look exactly the same.
// Popups are position:fixed inside it, so they scale with it too.
export const STAGE_W = 1280;
export const STAGE_H = 720;

const fitScale = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);

interface StageProps {
  /** Full-window background class; leave empty to show the page's own background. */
  bgClass?: string;
  children: ReactNode;
}

export default function Stage({ bgClass = '', children }: StageProps) {
  const [scale, setScale] = useState(fitScale);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);

  useEffect(() => {
    const onResize = () => {
      setScale(fitScale());
      setPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return (
    <div className={`fixed inset-0 overflow-hidden flex items-center justify-center select-none ${bgClass}`}>
      <div
        className="relative shrink-0"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        {children}
      </div>

      {portrait && (
        <div className="absolute inset-0 z-[100] bg-paper flex flex-col items-center justify-center gap-4 text-center px-8">
          <RotateCw size={48} className="text-grape-dark" />
          <p className="font-display text-2xl font-bold">Rotate your device</p>
          <p className="text-sm font-semibold text-ink-soft">FakeArt.io is played in landscape.</p>
        </div>
      )}
    </div>
  );
}
