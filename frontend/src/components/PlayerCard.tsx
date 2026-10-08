import React from 'react';
import { Pencil, UserCheck } from 'lucide-react';
import { Player, GamePhase } from '../types/game';

interface PlayerCardProps {
  player: Player;
  isCurrentDrawer: boolean;
  isSelf: boolean;
  currentPhase: GamePhase;
  onVote: (targetPlayerId: string) => void;
  hasVoted: boolean;
  votedTargetId: string;
}

export default function PlayerCard({
  player,
  isCurrentDrawer,
  isSelf,
  currentPhase,
  onVote,
  hasVoted,
  votedTargetId
}: PlayerCardProps) {
  const isVotingPhase = currentPhase === 'VOTING';
  const isSelectedForVote = votedTargetId === player.id;

  return (
    <div className={`card !rounded-2xl p-3 flex items-center justify-between gap-3 transition-all ${
      isCurrentDrawer ? 'pulse-active !bg-grape-soft' : ''
    } ${isSelf && !isCurrentDrawer ? '!bg-bubble-soft/70' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-ink flex items-center justify-center text-2xl">
          {player.avatar || '🎨'}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate">
              {player.name}
            </span>
            {isSelf && <span className="chip bg-bubble text-white">You</span>}
          </div>
          <div className="text-xs font-bold text-ink-soft">
            {player.score} pts
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isCurrentDrawer && (
          <div className="chip bg-grape text-white !text-[11px] !px-2 !py-1">
            <Pencil size={12} />
            Drawing
          </div>
        )}

        {isVotingPhase && !isSelf && (
          <button
            onClick={() => onVote(player.id)}
            disabled={hasVoted}
            className={`btn btn-sm ${isSelectedForVote ? 'btn-danger' : 'btn-secondary'}`}
          >
            {isSelectedForVote ? (
              <>
                <UserCheck size={14} />
                Voted
              </>
            ) : (
              'Vote'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
