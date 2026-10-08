import { useMemo, useState } from 'react';
import { Player } from '../types/game';
import Avatar from './Avatar';
import { useAvatarList } from '../utils/avatars';

const SLOT_COUNT = 4;

interface MatchmakingScreenProps {
  players: Player[];
  self: { id: string; name: string; avatar: string };
  matchFound: boolean;
  countdown: number;
  error?: string;
  onCancel: () => void;
}

/**
 * An empty slot: a slot-machine reel. A tall strip of avatars scrolls past the
 * round window until a real player takes the spot.
 */
function SlotReel() {
  const list = useAvatarList();
  // Each reel gets its own starting point and speed so the four don't spin in lockstep.
  const [seed] = useState(() => ({ offset: Math.random(), speed: Math.random(), phase: Math.random() }));

  const reel = useMemo(() => {
    const count = Math.max(6, list.length * 2);
    const offset = Math.floor(seed.offset * list.length);
    const strip = Array.from({ length: count }, (_, i) => list[(offset + i) % list.length]);
    return {
      // Twice over, so the loop can scroll exactly half its height and repeat seamlessly.
      items: [...strip, ...strip],
      seconds: count * (0.09 + seed.speed * 0.04),
      startAt: -seed.phase * count * 0.1,
    };
  }, [list, seed]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="reel-strip flex flex-col"
        style={{ animationDuration: `${reel.seconds}s`, animationDelay: `${reel.startAt}s` }}
      >
        {reel.items.map((id, i) => (
          <div key={i} className="w-full aspect-square shrink-0">
            <Avatar id={id} className="w-full h-full rounded-none" />
          </div>
        ))}
      </div>
      {/* Shading at the top and bottom of the window, like a real reel */}
      <div className="absolute inset-0 pointer-events-none reel-shade" />
    </div>
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
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-10 px-4 text-ink">

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
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 overflow-hidden flex items-center justify-center ${
                p
                  ? 'match-lock border-ink bg-grape-soft'
                  : 'border-dashed border-ink/30 bg-white/70'
              }`}
            >
              {p ? <Avatar id={p.avatar} /> : <SlotReel />}
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
