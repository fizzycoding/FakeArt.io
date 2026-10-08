import { useEffect, useState } from 'react';
import { Player } from '../types/game';

const FLASH_AVATARS = ['🎨', '🦊', '🚀', '👑', '🤖', '👾', '🐱', '🦄', '🐼', '🍕', '🐸', '🦁', '🐙', '🌈', '👻'];
const SLOT_COUNT = 4;

interface MatchmakingScreenProps {
  players: Player[];
  self: { id: string; name: string; avatar: string };
  matchFound: boolean;
  countdown: number;
  error?: string;
  onCancel: () => void;
}

/** An empty slot: avatars cut past rapidly until a real player takes the spot. */
function FlashingAvatar() {
  const [emoji, setEmoji] = useState(() => FLASH_AVATARS[Math.floor(Math.random() * FLASH_AVATARS.length)]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setEmoji((prev) => {
        let next = prev;
        while (next === prev) next = FLASH_AVATARS[Math.floor(Math.random() * FLASH_AVATARS.length)];
        return next;
      });
      setTick((t) => t + 1);
    }, 110);
    return () => clearInterval(id);
  }, []);

  return (
    <span key={tick} className="match-cut text-5xl sm:text-6xl select-none opacity-70">
      {emoji}
    </span>
  );
}

export default function MatchmakingScreen({
  players, self, matchFound, countdown, error, onCancel,
}: MatchmakingScreenProps) {
  // Before the server's first update arrives, we are the only one in the queue.
  const slots: (Pick<Player, 'id' | 'name' | 'avatar'> | undefined)[] = Array.from(
    { length: SLOT_COUNT },
    (_, i) => (players.length > 0 ? players[i] : i === 0 ? self : undefined),
  );
  const found = slots.filter(Boolean).length;

  return (
    <div className="match-bg fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 px-4 text-ink overflow-hidden">

      <div className="relative text-center">
        <h2 className="font-display text-4xl sm:text-5xl font-bold">
          {matchFound ? (
            <>Match <span className="text-grape">found!</span></>
          ) : (
            'Finding match…'
          )}
        </h2>
        <p className="mt-2 text-sm sm:text-base font-semibold text-ink-soft">
          {matchFound ? 'Get ready to draw' : `${found}/${SLOT_COUNT} players found`}
        </p>
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-8 sm:gap-8">
        {slots.map((p, idx) => (
          <div key={idx} className="flex flex-col items-center gap-3 w-28 sm:w-32">
            <div
              key={p ? `filled-${p.id}` : 'empty'}
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 flex items-center justify-center ${
                p
                  ? 'match-lock border-ink bg-grape-soft shadow-[0_5px_0_0_var(--color-ink)]'
                  : 'border-dashed border-ink/30 bg-white/70'
              }`}
            >
              {p ? <span className="text-5xl sm:text-6xl">{p.avatar}</span> : <FlashingAvatar />}
            </div>
            <span
              className={`font-display font-bold text-sm sm:text-base max-w-full truncate px-3 py-1 rounded-xl border-2 ${
                p
                  ? 'bg-white border-ink text-ink shadow-[0_3px_0_0_var(--color-ink)]'
                  : 'bg-white/60 border-ink/20 text-ink-soft tracking-[0.3em]'
              }`}
            >
              {p ? p.name : '???'}
              {p && p.id === self.id ? ' (You)' : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="relative h-28 flex flex-col items-center justify-center gap-3">
        {matchFound ? (
          <div className="card px-8 py-3 flex flex-col items-center">
            <span className="text-xs font-bold text-ink-soft uppercase tracking-widest">Starting in</span>
            <span key={countdown} className="match-cut font-display text-5xl font-bold tabular-nums leading-none text-grape-dark">
              {countdown}
            </span>
          </div>
        ) : (
          <>
            {error && <p className="text-sm font-semibold text-cherry">{error}</p>}
            <button onClick={onCancel} className="btn btn-secondary px-10 py-3 text-lg !text-cherry">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
