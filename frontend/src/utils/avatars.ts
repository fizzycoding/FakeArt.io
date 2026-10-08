import { useEffect, useState } from 'react';

// Avatars are the images public/pfp1.webp, pfp2.webp, pfp3.webp, ... and are
// referred to everywhere (profile, server, other players) by their id: "pfp1".
export const DEFAULT_AVATAR = 'pfp1';

const AVATAR_ID = /^pfp\d{1,3}$/;

export const isAvatarId = (value: unknown): value is string =>
  typeof value === 'string' && AVATAR_ID.test(value);

/** Anything that isn't a valid id (old emoji profiles, junk) becomes the default. */
export const normalizeAvatar = (value: unknown): string => (isAvatarId(value) ? value : DEFAULT_AVATAR);

export const avatarSrc = (id: unknown): string => `${import.meta.env.BASE_URL}${normalizeAvatar(id)}.webp`;

// Vite lists the avatar files at build time, so adding public/pfp6.webp is
// enough and the game never has to request a file that doesn't exist.
const avatarFiles = Object.keys(import.meta.glob('/public/pfp[0-9]*.webp', { query: '?url', import: 'default' }));

const AVATARS: string[] = avatarFiles
  .map((path) => /pfp(\d+)\.webp$/.exec(path)?.[1])
  .filter((n): n is string => !!n)
  .map(Number)
  .sort((a, b) => a - b)
  .map((n) => `pfp${n}`);

/** All avatar ids that exist, e.g. ["pfp1", "pfp2", ...]. */
export const loadAvatarList = (): Promise<string[]> => Promise.resolve(AVATARS.length ? AVATARS : [DEFAULT_AVATAR]);

/** The list of available avatar ids (starts with just the default while it loads). */
export const useAvatarList = (): string[] => {
  const [list, setList] = useState<string[]>([DEFAULT_AVATAR]);
  useEffect(() => {
    let alive = true;
    loadAvatarList().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return list;
};
