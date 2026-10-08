import { useEffect, useRef, useState } from 'react';
import { Clock, Send, UserCheck } from 'lucide-react';
import { ChatMessage, Player } from '../types/game';
import Avatar from './Avatar';

interface VotingModalProps {
  players: Player[];
  myPlayerId: string;
  leftIds: string[];
  timeLeft: number;
  hasVoted: boolean;
  votedIds: string[];
  votedTargetId: string;
  onVote: (targetPlayerId: string) => void;
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  chatDisabled: boolean;
}

const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function VotingModal({
  players, myPlayerId, leftIds, timeLeft, hasVoted, votedIds, votedTargetId, onVote, chatMessages, onSendMessage, chatDisabled,
}: VotingModalProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chatMessages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendMessage(text);
    setDraft('');
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className="absolute -inset-[100%] -z-10 bg-ink/40 backdrop-blur-sm" />
      <div className="card w-[1080px] h-[600px] p-5 flex flex-col gap-4 pop-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-bold">
            Who is the <span className="text-cherry">Fake Artist</span>?
          </h2>
          <div className="card !rounded-2xl px-4 py-2 flex items-center gap-2">
            <Clock size={22} className="text-grape-dark" />
            <span className="font-display font-bold text-3xl tabular-nums">{fmt(timeLeft)}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr] gap-4">
          {/* Sidebar: everyone, with a vote button */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {players.map((p) => {
              const left = leftIds.includes(p.id);
              const selected = votedTargetId === p.id;
              return (
                <div
                  key={p.id}
                  className={`card-soft !border-ink/30 p-3 flex items-center justify-between gap-2 ${left ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-ink overflow-hidden">
                      <Avatar id={p.avatar} />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="font-bold text-sm truncate">
                        {p.name}
                        {p.id === myPlayerId && <span className="text-ink-soft"> (You)</span>}
                      </div>
                      {votedIds.includes(p.id) && (
                        <span className="chip bg-mint text-white mt-1">
                          <UserCheck size={11} />
                          Voted
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onVote(p.id)}
                    disabled={hasVoted || left}
                    className={`btn btn-sm shrink-0 ${selected ? 'btn-danger' : 'btn-secondary'}`}
                  >
                    {selected ? (
                      <>
                        <UserCheck size={14} />
                        Voted
                      </>
                    ) : (
                      'Vote'
                    )}
                  </button>
                </div>
              );
            })}
            {hasVoted && (
              <p className="text-xs font-semibold text-ink-soft text-center">Vote locked in. Waiting for the others…</p>
            )}
          </div>

          {chatDisabled ? (
            <div className="card-soft !border-ink/30 flex items-center justify-center text-center px-8">
              <p className="text-sm font-semibold text-ink-soft">
                Chat is turned off. Look back at the drawings and trust your eyes, then vote!
              </p>
            </div>
          ) : (
            <>
              {/* Main: chat */}
              <div className="card-soft !border-ink/30 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                  {chatMessages.length === 0 && (
                    <p className="m-auto text-sm font-semibold text-ink-soft">
                      Say something! Who drew something odd?
                    </p>
                  )}
                  {chatMessages.map((m, i) => {
                    const mine = m.senderId === myPlayerId;
                    return (
                      <div key={i} className={`max-w-[80%] ${mine ? 'self-end text-right' : 'self-start'}`}>
                        <div className="text-[11px] font-bold text-ink-soft">
                          {mine ? 'You' : m.senderName} · {m.timestamp}
                        </div>
                        <div
                          className={`inline-block px-3 py-1.5 rounded-2xl border-2 border-ink text-sm font-semibold break-words ${
                            mine ? 'bg-grape text-white' : 'bg-white'
                          }`}
                        >
                          {m.message}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                <form onSubmit={submit} className="p-3 border-t-2 border-ink/15 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={200}
                    placeholder="Type a message…"
                    className="input !py-2"
                  />
                  <button type="submit" className="btn btn-primary btn-sm shrink-0" aria-label="Send">
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
