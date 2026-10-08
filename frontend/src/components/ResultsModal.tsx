import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Player, RoundResults } from '../types/game';

interface ResultsModalProps {
  results: RoundResults;
  players: Player[];
  onNextMatch: () => void;
}

export default function ResultsModal({ results, players, onNextMatch }: ResultsModalProps) {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (results.isGameOver) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [results]);

  const impostorPlayer = players.find(p => p.id === results.impostorId);

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 max-w-md w-full flex flex-col items-center text-center gap-4 pop-in">
        {/* Banner icon */}
        <div className="w-16 h-16 rounded-full bg-bubble-soft border-2 border-ink flex items-center justify-center text-cherry">
          <ShieldAlert size={34} />
        </div>

        <div>
          <h2 className="font-display text-3xl font-bold">
            {results.isGameOver ? 'Session Complete!' : 'Round Results'}
          </h2>
          <div className="text-sm font-semibold text-ink-soft mt-1">
            Artists drew <strong className="text-grape-dark font-bold">{results.word}</strong>
            {' · '}Impostor drew <strong className="text-cherry font-bold">{results.impostorWord}</strong>
          </div>
        </div>

        {/* Impostor Reveal Card */}
        <div className="bg-bubble-soft border-2 border-ink rounded-2xl p-3 w-full flex items-center justify-center gap-3">
          <span className="text-3xl">{impostorPlayer?.avatar || '👺'}</span>
          <span className="font-display font-semibold text-lg text-cherry">
            {impostorPlayer?.name || 'Impostor'} was the Impostor!
          </span>
        </div>

        {/* Player outcomes */}
        <div className="w-full flex flex-col gap-2">
          <div className="text-sm font-bold text-ink-soft text-left">Player outcomes</div>

          {players.map((p) => {
            const delta = results.scoreDeltas[p.id] || 0;
            const targetId = results.votes[p.id];
            const targetPlayer = players.find(tp => tp.id === targetId);

            return (
              <div key={p.id} className="card-soft p-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{p.avatar}</span>
                  <span className="font-bold">{p.name}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ink-soft">
                    {targetPlayer ? `Voted: ${targetPlayer.name}` : 'No vote'}
                  </span>
                  <span className={`font-display font-bold ${delta >= 0 ? 'text-mint' : 'text-cherry'}`}>
                    {delta >= 0 ? `+${delta}` : delta} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action / Countdown */}
        {!results.isGameOver ? (
          <div className="mt-1 text-sm font-semibold text-ink-soft">
            Next round in <strong className="text-grape-dark font-bold">{countdown}s</strong>…
          </div>
        ) : (
          <button onClick={onNextMatch} className="btn btn-primary w-full py-3 text-lg">
            Return to Menu
          </button>
        )}
      </div>
    </div>
  );
}
