// Fullscreen for phones and tablets, so the browser's address bar and toolbar
// get out of the way. Android Chrome and iPad support the Fullscreen API; an
// iPhone doesn't, so there it only works once the game is added to the Home
// Screen (the page tags and manifest in index.html turn that into a fullscreen app).

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

const doc = document as FullscreenDocument;

/** A touch screen is the main input (phones, tablets), as opposed to a mouse. */
export const isTouchDevice = (): boolean => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Whether this browser lets a page go fullscreen at all. */
export const isFullscreenSupported = (): boolean => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

export const isFullscreen = (): boolean => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

/** Already running as an installed app (Home Screen), which has no browser bars to hide. */
export const isInstalledApp = (): boolean =>
  !!window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Goes fullscreen. Must be called from a tap or click. Resolves true if it worked. */
export const enterFullscreen = async (lockLandscape: boolean): Promise<boolean> => {
  const el = document.documentElement as FullscreenElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }

  // The game is played sideways; Android can lock that once fullscreen.
  if (lockLandscape) {
    try {
      await (screen.orientation as LockableOrientation)?.lock?.('landscape');
    } catch {
      // not supported here: the "Rotate your device" screen covers it
    }
  }
  return true;
};

export const exitFullscreen = async (): Promise<void> => {
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
  } catch {
    // nothing to exit
  }
};

export const onFullscreenChange = (fn: () => void): (() => void) => {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
};

/**
 * On a touch device, goes fullscreen on the player's first tap (browsers only allow
 * it from a tap). If they leave fullscreen later we don't fight them: the button
 * in the corner brings it back.
 *
 * `allow` is asked at the moment of the tap, so the game can first find out whether
 * it is running on CrazyGames, which handles fullscreen itself.
 */
let tapListenerArmed = false;

export const goFullscreenOnFirstTap = (allow: () => Promise<boolean>, shouldLockLandscape: () => boolean): void => {
  if (tapListenerArmed) return;
  if (!isTouchDevice() || !isFullscreenSupported() || isInstalledApp() || isFullscreen()) return;
  tapListenerArmed = true;

  let attempts = 0;
  const stop = () => document.removeEventListener('pointerup', onTap, true);
  const onTap = async () => {
    attempts += 1;
    if (!(await allow())) return stop();
    const worked = await enterFullscreen(shouldLockLandscape());
    if (worked || attempts >= 3) stop();
  };
  document.addEventListener('pointerup', onTap, true);
};
