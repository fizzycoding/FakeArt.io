declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        game: {
          gameplayStart: () => void;
          gameplayStop: () => void;
          happytime: () => void;
        };
      };
    };
  }
}

export const initCrazyGamesSDK = (): void => {
  try {
    if (window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.gameplayStart();
    }
  } catch (e) {}
};

export const triggerGameplayStart = (): void => {
  try {
    if (window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.gameplayStart();
    }
  } catch (e) {}
};

export const triggerGameplayStop = (): void => {
  try {
    if (window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.gameplayStop();
    }
  } catch (e) {}
};

export const triggerHappyTime = (): void => {
  try {
    if (window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.happytime();
    }
  } catch (e) {}
};
