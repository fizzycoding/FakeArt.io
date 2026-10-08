import { useEffect, useState } from 'react';
import { ShieldAlert, Trophy } from 'lucide-react';
import { Player, RoundResults } from '../types/game';

interface ResultsModalProps {
  results: RoundResults;
  players: Player[];
  roundNumber: number;
  maxRounds: number;
  onReturnHome: () => void;
}

export default function ResultsModal({ results, players, roundNumber, maxRounds, onReturnHome }: ResultsModalProps) {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (results.isGameOver) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [results]);

  const impostorPlayer = players.find((p) => p.id === results.impostorId);

  // Final standings: everyone still in the game, best score first.
  const standings = players
    .filter((p) => results.totalScores[p.id] !== undefined)
    .map((p) => ({ player: p, total: results.totalScores[p.id] }))
    .sort((a, b) => b.total - a.total);
  const topScore = standings.length ? standings[0].total : 0;
  const winners = standings.filter((s) => s.total === topScore);

  if (results.isGameOver) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="absolute -inset-[100%] -z-10 bg-ink/50 backdrop-blur-sm" />
        <div className="card p-6 max-w-md w-full flex flex-col items-center text-center gap-4 pop-in">
          <div className="w-16 h-16 rounded-full bg-sun/30 border-2 border-ink flex items-center justify-center text-sun">
            <Trophy size={34} />
          </div>

          <div>
            <div className="text-xs font-bold text-ink-soft uppercase tracking-widest">
              {winners.length > 1 ? 'Winners' : 'Winner'}
            </div>
            <h2 className="font-display text-3xl font-bold text-grape-dark">
              {winners.map((w) => `${w.player.avatar} ${w.player.name}`).join(' & ') || 'Nobody'}
            </h2>
            <div className="text-sm font-semibold text-ink-soft mt-1">
              with {topScore} pts after {maxRounds} rounds
            </div>
          </div>

          <div className="w-full flex flex-col gap-2">
            {standings.map((s, i) => (
              <div key={s.player.id} className="card-soft p-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-ink-soft w-5">{i + 1}</span>
                  <span className="text-xl">{s.player.avatar}</span>
                  <span className="font-bold">{s.player.name}</span>
                </div>
                <span className="font-display font-bold">{s.total} pts</span>
              </div>
            ))}
          </div>

          <button onClick={onReturnHome} className="btn btn-primary w-full py-3 text-lg">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <div className="absolute -inset-[100%] -z-10 bg-ink/50 backdrop-blur-sm" />
      <div className="card p-6 max-w-md w-full flex flex-col items-center text-center gap-4 pop-in">
        <div className="w-16 h-16 rounded-full bg-bubble-soft border-2 border-ink flex items-center justify-center text-cherry">
          <ShieldAlert size={34} />
        </div>

        <div>
          <h2 className="font-display text-3xl font-bold">Round {roundNumber}/{maxRounds} Results</h2>
          <div className="text-sm font-semibold text-ink-soft mt-1">
            Artists drew <strong className="text-grape-dark font-bold">{results.word}</strong>
            {' · '}Impostor drew <strong className="text-cherry font-bold">{results.impostorWord}</strong>
          </div>
        </div>

        <div className="bg-bubble-soft border-2 border-ink rounded-2xl p-3 w-full flex items-center justify-center gap-3">
          <span className="text-3xl">{impostorPlayer?.avatar || '👺'}</span>
          <span className="font-display font-semibold text-lg text-cherry">
            {impostorPlayer?.name || 'Impostor'} was the Impostor!
          </span>
        </div>

        <div className="w-full flex flex-col gap-2">
          <div className="text-sm font-bold text-ink-soft text-left">Player outcomes</div>

          {players.map((p) => {
            const delta = results.scoreDeltas[p.id] || 0;
            const isImpostor = p.id === results.impostorId;
            const targetPlayer = players.find((tp) => tp.id === results.votes[p.id]);

            return (
              <div key={p.id} className="card-soft p-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">{p.avatar}</span>
                  <div className="min-w-0 text-left leading-tight">
                    <div className="font-bold truncate">{p.name}</div>
                    <div className={`text-xs font-bold ${isImpostor ? 'text-cherry' : 'text-grape-dark'}`}>
                      Word: {isImpostor ? results.impostorWord : results.word}
                      {isImpostor && ' (Fake Artist)'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold text-ink-soft">
                    {targetPlayer ? `Voted: ${targetPlayer.name}` : 'No vote'}
                  </span>
                  <span className={`font-display font-bold ${delta > 0 ? 'text-mint' : 'text-ink-soft'}`}>
                    {delta > 0 ? `+${delta}` : '0'} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-1 text-sm font-semibold text-ink-soft">
          Next round in <strong className="text-grape-dark font-bold">{countdown}s</strong>…
        </div>
      </div>
    </div>
  );
}
