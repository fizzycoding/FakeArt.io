import { Pencil } from 'lucide-react';
import { Player } from '../types/game';

interface PlayerCardProps {
  player: Player;
  isCurrentDrawer: boolean;
  isSelf: boolean;
  hasLeft?: boolean;
}

export default function PlayerCard({ player, isCurrentDrawer, isSelf, hasLeft = false }: PlayerCardProps) {
  return (
    <div className={`card !rounded-2xl p-3 flex items-center justify-between gap-3 transition-all ${
      isCurrentDrawer ? 'pulse-active !bg-grape-soft' : ''
    } ${isSelf && !isCurrentDrawer ? '!bg-bubble-soft/70' : ''} ${hasLeft ? 'opacity-50 grayscale' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-ink flex items-center justify-center text-2xl">
          {player.avatar || '🎨'}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate">{player.name}</span>
            {isSelf && <span className="chip bg-bubble text-white">You</span>}
          </div>
          <div className="text-xs font-bold text-ink-soft">{player.score} pts</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasLeft && <div className="chip bg-white text-ink-soft !text-[11px] !px-2 !py-1">Left</div>}

        {isCurrentDrawer && !hasLeft && (
          <div className="chip bg-grape text-white !px-1.5 !py-1.5" title="Drawing">
            <Pencil size={13} />
          </div>
        )}
      </div>
    </div>
  );
}
