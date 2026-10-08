import { setMuted } from './audio';

// CrazyGames HTML5 SDK v3 wrapper.
//
// The SDK only works on localhost ("local") and on CrazyGames ("crazygames").
// Anywhere else (or if the script is blocked) its environment is "disabled"
// and every call would throw, so each function here quietly does nothing
// unless the SDK is actually usable. The game therefore runs the same
// everywhere; it just has no ads, invites or platform events outside CrazyGames.

interface SdkError {
  code?: string;
  message?: string;
}

interface AdCallbacks {
  adStarted: () => void;
  adFinished: () => void;
  adError: (error: SdkError) => void;
}

interface GameSettings {
  disableChat?: boolean;
  muteAudio?: boolean;
}

interface CrazyGamesSDK {
  init: () => Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks: AdCallbacks) => void;
    hasAdblock: () => Promise<boolean>;
  };
  game: {
    settings: GameSettings;
    addSettingsChangeListener: (fn: (s: GameSettings) => void) => void;
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    happytime: () => void;
    inviteLink: (params: Record<string, string | number>) => string;
    getInviteParam: (key: string) => string | null;
    addJoinRoomListener: (fn: (params: Record<string, string>) => void) => void;
    updateRoom: (room: { roomId?: string; isJoinable?: boolean; inviteParams?: Record<string, string> }) => void;
    leftRoom: () => void;
  };
  user: {
    isUserAccountAvailable: boolean;
    getUser: () => Promise<{ username?: string } | null>;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDK };
  }
}

let sdk: CrazyGamesSDK | null = null;

/** Runs a call against the SDK and never lets a platform hiccup break the game. */
const safe = <T>(fn: (s: CrazyGamesSDK) => T): T | undefined => {
  if (!sdk) return undefined;
  try {
    return fn(sdk);
  } catch {
    return undefined;
  }
};

/** True when the SDK loaded and is running somewhere it supports. */
export const isSdkUsable = (): boolean => sdk !== null;

let initPromise: Promise<void> | null = null;

/** Initialises the SDK once. Safe to call repeatedly, and safe if it's missing. */
export const initCrazyGamesSDK = (): Promise<void> => {
  if (!initPromise) {
    initPromise = (async () => {
      const candidate = window.CrazyGames?.SDK;
      if (!candidate) return;
      try {
        await candidate.init();
      } catch {
        return;
      }
      if (candidate.environment !== 'local' && candidate.environment !== 'crazygames') return;
      sdk = candidate;

      // CrazyGames can ask us to silence the game, and this beats our own audio settings.
      setMuted('sdk', !!candidate.game.settings.muteAudio);
      safe((s) =>
        s.game.addSettingsChangeListener((settings) => {
          setMuted('sdk', !!settings.muteAudio);
          chatDisabled = !!settings.disableChat;
        }),
      );
      chatDisabled = !!candidate.game.settings.disableChat;
    })();
  }
  return initPromise;
};

let chatDisabled = false;
/** CrazyGames can switch chat off (e.g. for younger audiences). */
export const isChatDisabled = (): boolean =>
  chatDisabled || new URLSearchParams(window.location.search).get('disableChat') === 'true';

// ---------- Loading and gameplay events ----------

export const loadingStart = (): void => void safe((s) => s.game.loadingStart());
export const loadingStop = (): void => void safe((s) => s.game.loadingStop());

// The platform wants one start per play session and one stop per break, so
// remember the state and drop duplicates.
let playing = false;

export const triggerGameplayStart = (): void => {
  if (playing) return;
  playing = true;
  safe((s) => s.game.gameplayStart());
};

export const triggerGameplayStop = (): void => {
  if (!playing) return;
  playing = false;
  safe((s) => s.game.gameplayStop());
};

/** A celebration for something special (winning a whole game). Use sparingly. */
export const triggerHappyTime = (): void => void safe((s) => s.game.happytime());

// ---------- Player account ----------

/** The player's CrazyGames username, if they are logged in. */
export const getCrazyGamesUsername = async (): Promise<string | null> => {
  if (!sdk?.user.isUserAccountAvailable) return null;
  try {
    const user = await sdk.user.getUser();
    return user?.username || null;
  } catch {
    return null;
  }
};

// ---------- Rooms and invites ----------

/** Tell CrazyGames which private room the player is in, so friends can join. */
export const shareRoom = (roomCode: string, joinable: boolean): void =>
  void safe((s) =>
    s.game.updateRoom({ roomId: roomCode, isJoinable: joinable, inviteParams: { roomCode } }),
  );

export const leaveSharedRoom = (): void => void safe((s) => s.game.leftRoom());

/** A CrazyGames link that drops the friend straight into this room, if available. */
export const getInviteLink = (roomCode: string): string | null => safe((s) => s.game.inviteLink({ roomCode })) ?? null;

/** The room code from the invite link this game was opened with, if any. */
export const getInviteRoomCode = (): string | null => safe((s) => s.game.getInviteParam('roomCode')) ?? null;

/** Called when a friend invites the player while the game is already open. */
let joinListenerAdded = false;
export const onInviteJoin = (fn: (roomCode: string) => void): void => {
  if (joinListenerAdded) return;
  joinListenerAdded = true;
  safe((s) =>
    s.game.addJoinRoomListener((params) => {
      if (params?.roomCode) fn(String(params.roomCode));
    }),
  );
};

// ---------- Video ads ----------

export type AdFailure = 'adblock' | 'unfilled' | 'cooldown' | 'other';

export type RewardedAdResult =
  /** The reward is granted. `watched` is false when ads simply aren't active (outside CrazyGames, Basic Launch). */
  | { granted: true; watched: boolean }
  /** No reward: the ad didn't play. */
  | { granted: false; reason: AdFailure };

/** Whether an adblocker is stopping ads from showing. */
export const hasAdblock = async (): Promise<boolean> => {
  if (!sdk) return false;
  try {
    return !!(await sdk.ad.hasAdblock());
  } catch {
    return false;
  }
};

const failureFor = (code?: string): AdFailure => {
  switch (code) {
    case 'adblock':
      return 'adblock';
    case 'unfilled':
      return 'unfilled';
    case 'adCooldown':
      return 'cooldown';
    default:
      return 'other';
  }
};

const AD_TIMEOUT_MS = 120_000;

/**
 * Shows a rewarded ad. The game's sound is muted only while the ad is really
 * playing, gameplay is reported as stopped, and the promise settles once the
 * ad has finished or failed. Per the CrazyGames rules, a failed ad never earns
 * the reward, except where ads are switched off for the platform's Basic Launch.
 */
export const requestRewardedAd = (): Promise<RewardedAdResult> => {
  const current = sdk;
  if (!current) return Promise.resolve({ granted: true, watched: false });

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setMuted('ad', false);
      resolve(result);
    };

    timer = setTimeout(() => finish({ granted: false, reason: 'other' }), AD_TIMEOUT_MS);

    try {
      current.ad.requestAd('rewarded', {
        adStarted: () => {
          setMuted('ad', true);
          triggerGameplayStop();
        },
        adFinished: () => finish({ granted: true, watched: true }),
        adError: (error) => {
          if (error?.code === 'adsDisabledBasicLaunch') {
            finish({ granted: true, watched: false });
          } else {
            finish({ granted: false, reason: failureFor(error?.code) });
          }
        },
      });
    } catch {
      // The SDK refused the request outright; treat ads as unavailable here.
      finish({ granted: true, watched: false });
    }
  });
};
