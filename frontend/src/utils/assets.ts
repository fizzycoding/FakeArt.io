declare global {
  interface Window {
    /** Filled in by the standalone build, which embeds images and music inside the HTML file. */
    __FAKEART_ASSETS__?: Record<string, string>;
  }
}

/** Where to load a file from public/: embedded data in the standalone build, otherwise the normal path. */
export const assetUrl = (name: string): string =>
  window.__FAKEART_ASSETS__?.[name] ?? `${import.meta.env.BASE_URL}${name}`;
