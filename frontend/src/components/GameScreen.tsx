import { useState } from 'react';
import { Clock, Pencil } from 'lucide-react';
import DrawingCanvas from './DrawingCanvas';
import PlayerCard from './PlayerCard';
import VotingModal from './VotingModal';
import { ChatMessage, GamePhase, Player, StrokeData } from '../types/game';

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
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  remoteStrokes: StrokeData[];
  clearSignal: number;
  onSendStroke: (stroke: StrokeData) => void;
  onEndStroke: () => void;
}

export default function GameScreen(props: GameScreenProps) {
  const {
    players, myPlayerId, activeDrawerId, currentPhase, phaseTimeLeft, secretWord,
    drawRound, totalDrawRounds, roundNumber, maxMatches, leftIds, hasVoted, votedTargetId,
  } = props;

  const [color, setColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(6);

  const isDrawingPhase = currentPhase === 'DRAWING';
  const isMyTurn = isDrawingPhase && myPlayerId === activeDrawerId;
  const drawer = players.find((p) => p.id === activeDrawerId);

  let status = '';
  if (currentPhase === 'VOTING') status = 'Vote for the Fake Artist!';
  else if (isMyTurn) status = 'Your turn — two strokes!';
  else if (isDrawingPhase && drawer) status = `${drawer.name} is drawing…`;

  return (
    <div className="w-full h-full">
      <div className="relative w-full h-full grid grid-cols-[250px_620px_280px] items-start content-start gap-6 px-10 pt-[50px]">
        {/* Left: players */}
        <div className="flex flex-col gap-3">
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
            />
          ))}
        </div>

        {/* Center: canvas only */}
        <div className="w-[620px] h-[620px] bg-white rounded-2xl overflow-hidden border-[3px] border-grape-dark shadow-[0_4px_20px_rgba(60,30,120,0.12)]">
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
        <div className="flex flex-col gap-4">
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
              {isDrawingPhase ? `Drawing ${drawRound}/${totalDrawRounds}` : currentPhase}
            </span>
          </div>

          <div className="card !rounded-2xl px-4 py-3 text-center">
            <div className="text-xs font-bold text-ink-soft uppercase tracking-wider">Your word</div>
            <div className="font-display font-bold text-2xl text-grape-dark break-words">{secretWord}</div>
            <div className="text-xs font-bold text-ink-soft mt-1">Round {roundNumber}/{maxMatches}</div>
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

        {currentPhase === 'VOTING' && (
          <VotingModal
            players={players}
            myPlayerId={myPlayerId}
            leftIds={leftIds}
            timeLeft={phaseTimeLeft}
            hasVoted={hasVoted}
            votedTargetId={votedTargetId}
            onVote={props.onVote}
            chatMessages={props.chatMessages}
            onSendMessage={props.onSendMessage}
          />
        )}
      </div>

    </div>
  );
}
