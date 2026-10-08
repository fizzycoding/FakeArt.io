import { useEffect, useState } from 'react';
import { Clock, Pencil, RotateCw } from 'lucide-react';
import DrawingCanvas from './DrawingCanvas';
import PlayerCard from './PlayerCard';
import { GamePhase, Player, StrokeData } from '../types/game';

// The whole game is laid out on one fixed-size stage that is scaled to fit the
// screen, so a laptop and a phone held sideways look exactly the same.
const STAGE_W = 1280;
const STAGE_H = 720;

const COLORS = [
  '#000000', '#EF4444', '#3B82F6', '#10B981',
  '#F59E0B', '#8B5CF6', '#EC4899', '#FFFFFF',
];

interface GameScreenProps {
  players: Player[];
  myPlayerId: string;
  activeDrawerId: string;
  currentPhase: GamePhase;
  phaseTimeLeft: number;
  secretWord: string;
  drawRound: number;
  totalDrawRounds: number;
  roundNumber: number;
  maxMatches: number;
  leftIds: string[];
  hasVoted: boolean;
  votedTargetId: string;
  onVote: (targetPlayerId: string) => void;
  remoteStrokes: StrokeData[];
  clearSignal: number;
  onSendStroke: (stroke: StrokeData) => void;
  onEndStroke: () => void;
}

const fitScale = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);

export default function GameScreen(props: GameScreenProps) {
  const {
    players, myPlayerId, activeDrawerId, currentPhase, phaseTimeLeft, secretWord,
    drawRound, totalDrawRounds, roundNumber, maxMatches, leftIds, hasVoted, votedTargetId,
  } = props;

  const [scale, setScale] = useState(fitScale);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [color, setColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(6);

  useEffect(() => {
    const onResize = () => {
      setScale(fitScale());
      setPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isDrawingPhase = currentPhase === 'DRAWING';
  const isMyTurn = isDrawingPhase && myPlayerId === activeDrawerId;
  const drawer = players.find((p) => p.id === activeDrawerId);

  let status = '';
  if (currentPhase === 'VOTING') status = 'Vote for the Fake Artist!';
  else if (isMyTurn) status = 'Your turn — one stroke!';
  else if (isDrawingPhase && drawer) status = `${drawer.name} is drawing…`;

  return (
    <div className="game-bg fixed inset-0 overflow-hidden flex items-center justify-center select-none">
      <div
        className="shrink-0 grid grid-cols-[250px_620px_280px] items-center gap-6 px-10"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        {/* Left: players */}
        <div className="flex flex-col gap-3 justify-center">
          <div className="font-display text-sm font-semibold text-ink-soft tracking-wider uppercase px-1">
            Players
          </div>
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              isCurrentDrawer={p.id === activeDrawerId && isDrawingPhase}
              isSelf={p.id === myPlayerId}
              hasLeft={leftIds.includes(p.id)}
              currentPhase={currentPhase}
              onVote={props.onVote}
              hasVoted={hasVoted}
              votedTargetId={votedTargetId}
            />
          ))}
        </div>

        {/* Center: canvas only */}
        <div className="w-[620px] h-[620px] bg-white rounded-3xl overflow-hidden border-2 border-ink shadow-[0_6px_0_0_var(--color-ink)]">
          <DrawingCanvas
            isMyTurn={isMyTurn}
            color={color}
            brushWidth={brushWidth}
            onSendStroke={props.onSendStroke}
            onEndStroke={props.onEndStroke}
            remoteStrokes={props.remoteStrokes}
            clearSignal={props.clearSignal}
          />
        </div>

        {/* Right: timer, word, tools */}
        <div className="flex flex-col gap-4 justify-center">
          <div className="card !rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={22} className="text-grape-dark" />
              <span className="font-display font-bold text-3xl tabular-nums">{phaseTimeLeft}s</span>
            </div>
            <span
              className={`chip !text-[11px] !px-2 !py-1 ${
                isDrawingPhase ? 'bg-grape-soft text-grape-dark' : 'bg-sun/30 text-ink'
              }`}
            >
              {isDrawingPhase ? `Round ${drawRound}/${totalDrawRounds}` : currentPhase}
            </span>
          </div>

          <div className="card !rounded-2xl px-4 py-3 text-center">
            <div className="text-xs font-bold text-ink-soft uppercase tracking-wider">Your word</div>
            <div className="font-display font-bold text-2xl text-grape-dark break-words">{secretWord}</div>
            {maxMatches > 1 && (
              <div className="text-xs font-semibold text-ink-soft mt-1">Match {roundNumber}/{maxMatches}</div>
            )}
          </div>

          {status && (
            <div className="card-soft px-3 py-2 text-center text-sm font-bold flex items-center justify-center gap-2">
              {isMyTurn && <Pencil size={14} className="text-grape-dark" />}
              {status}
            </div>
          )}

          <div
            className={`card !rounded-2xl p-4 flex flex-col gap-4 transition-opacity ${
              isMyTurn ? 'opacity-100' : 'opacity-50 pointer-events-none'
            }`}
          >
            <div className="grid grid-cols-4 gap-3 justify-items-center">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  style={{ backgroundColor: c }}
                  className={`w-9 h-9 rounded-full border-2 border-ink transition-transform cursor-pointer ${
                    color === c ? 'scale-110 ring-4 ring-grape/40' : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="2"
                max="24"
                value={brushWidth}
                onChange={(e) => setBrushWidth(Number(e.target.value))}
                className="flex-1 accent-grape cursor-pointer"
              />
              <span className="text-xs font-bold text-ink-soft w-10 text-right">{brushWidth}px</span>
            </div>
          </div>
        </div>
      </div>

      {portrait && (
        <div className="absolute inset-0 z-10 game-bg flex flex-col items-center justify-center gap-4 text-center px-8">
          <RotateCw size={48} className="text-grape-dark" />
          <p className="font-display text-2xl font-bold">Rotate your device</p>
          <p className="text-sm font-semibold text-ink-soft">FakeArt.io is played in landscape.</p>
        </div>
      )}
    </div>
  );
}
