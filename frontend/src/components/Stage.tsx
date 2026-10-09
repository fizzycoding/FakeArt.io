import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

// Everything in the app is laid out on one fixed-size stage that is scaled to
// fit the window, so a laptop and a phone held sideways look exactly the same.
// Popups are position:fixed inside it, so they scale with it too.
export const STAGE_W = 1280;
export const STAGE_H = 720;

interface StageProps {
  /** Full-window background class; leave empty to show the page's own background. */
  bgClass?: string;
  children: ReactNode;
}

export default function Stage({ bgClass = '', children }: StageProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);

  // Fit the stage inside the space left after the phone's notch and rounded corners
  // (safe areas), and follow it as browser bars appear and disappear.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      setScale(Math.min(box.clientWidth / STAGE_W, box.clientHeight / STAGE_H));
      setPortrait(window.innerHeight > window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 overflow-clip select-none ${bgClass}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <div ref={boxRef} className="relative w-full h-full flex items-center justify-center">
        <div className="relative shrink-0" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
          {children}
        </div>
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
