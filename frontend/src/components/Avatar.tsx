import { avatarSrc } from '../utils/avatars';

interface AvatarProps {
  /** Avatar id such as "pfp1". Anything invalid falls back to the default. */
  id: string | undefined;
  /** Size and any extra classes, e.g. "w-10 h-10". Defaults to filling its parent. */
  className?: string;
}

export default function Avatar({ id, className = 'w-full h-full' }: AvatarProps) {
  return (
    <img
      src={avatarSrc(id)}
      alt=""
      draggable={false}
      decoding="async"
      className={`rounded-full object-cover select-none ${className}`}
    />
  );
}
