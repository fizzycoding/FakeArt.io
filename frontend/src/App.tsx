import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Users, Plus, Link2, LogIn, Settings, Clock, Copy, ArrowLeft
} from 'lucide-react';
import DrawingCanvas from './components/DrawingCanvas';
import PlayerCard from './components/PlayerCard';
import ChatPanel from './components/ChatPanel';
import ResultsModal from './components/ResultsModal';
import ProfileModal from './components/ProfileModal';
import { 
  Player, StrokeData, ChatMessage, RoundResults, PlayerProfile, GamePhase 
} from './types/game';
import { 
  triggerGameplayStart, triggerGameplayStop, triggerHappyTime 
} from './utils/crazygames';

const getWebSocketUrl = (): string => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return import.meta.env.PROD
    ? `${protocol}//${window.location.host}/ws`
    : 'ws://localhost:8080/ws';
};

const WS_URL = getWebSocketUrl();

export default function App() {
  const [screen, setScreen] = useState<'MENU' | 'LOBBY' | 'GAME'>('MENU');
  const [profile, setProfile] = useState<PlayerProfile>(() => {
    const saved = localStorage.getItem('fakeart_profile');
    if (saved) return JSON.parse(saved);
    return {
      name: 'Artist_' + Math.floor(1000 + Math.random() * 9000),
      avatar: '🎨',
      matchesPlayed: 0,
      matchesWon: 0
    };
  });

  const [showProfile, setShowProfile] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinInputCode, setJoinInputCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [connError, setConnError] = useState('');
  const [isCustomRoom, setIsCustomRoom] = useState(false);
  const [hostId, setHostId] = useState('');
  const [queueWaiting, setQueueWaiting] = useState(1);
  
  const [myPlayerId, setMyPlayerId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPhase, setCurrentPhase] = useState<GamePhase>('LOBBY');
  const [secretWord, setSecretWord] = useState('');
  const [activeDrawerId, setActiveDrawerId] = useState('');
  const [drawRound, setDrawRound] = useState(1);
  const [totalDrawRounds, setTotalDrawRounds] = useState(4);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(15);
  const [roundNumber, setRoundNumber] = useState(1);
  const [maxMatches, setMaxMatches] = useState(1);

  const [remoteStrokes, setRemoteStrokes] = useState<StrokeData[]>([]);
  const [clearSignal, setClearSignal] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [votedTargetId, setVotedTargetId] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    localStorage.setItem('fakeart_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (phaseTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setPhaseTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phaseTimeLeft]);

  const connectWebSocket = (onOpenCallback?: () => void) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (onOpenCallback) onOpenCallback();
      return;
    }

    setConnError('');
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (onOpenCallback) onOpenCallback();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {}
    };

    ws.onerror = () => {
      setConnError("Can't reach the game server. Is the backend running?");
    };

    ws.onclose = () => {
      setScreen('MENU');
    };

    wsRef.current = ws;
  };

  const sendWSMessage = (type: string, payload: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  };

  const handleServerMessage = (msg: { type?: string; Type?: string; payload?: any; Payload?: any }) => {
    const msgType = msg.type || msg.Type;
    const payload = msg.payload || msg.Payload || {};

    switch (msgType) {
      case 'PLAYER_INFO':
        setMyPlayerId(payload.id);
        break;

      case 'ROOM_CREATED':
      case 'JOIN_SUCCESS':
        setRoomCode(payload.code);
        setPlayers(payload.players || []);
        setHostId(payload.hostId || '');
        setIsCustomRoom(true);
        setScreen('LOBBY');
        break;

      case 'LOBBY_UPDATE':
        setPlayers(payload.players || []);
        setHostId(payload.hostId || '');
        break;

      case 'QUEUE_UPDATE':
        setQueueWaiting(payload.waiting || 1);
        break;

      case 'GAME_ABORTED':
        setConnError(payload.message || 'The game ended.');
        triggerGameplayStop();
        setCurrentPhase('LOBBY');
        wsRef.current?.close();
        break;

      case 'START_ROUND':
        triggerGameplayStart();
        setSecretWord(payload.word || '');
        setRoundNumber(payload.roundNumber || 1);
        setMaxMatches(payload.maxMatches || 1);
        setPlayers(payload.players || []);
        setRemoteStrokes([]);
        setChatMessages([]);
        setHasVoted(false);
        setVotedTargetId('');
        setRoundResults(null);
        setScreen('GAME');
        break;

      case 'TURN_CHANGE':
        setActiveDrawerId(payload.drawerId);
        setDrawRound(payload.drawRound || 1);
        setTotalDrawRounds(payload.totalRounds || 4);
        setPhaseTimeLeft(payload.durationSecs || 15);
        break;

      case 'PHASE_CHANGE':
        setCurrentPhase(payload.phase);
        setPhaseTimeLeft(payload.durationSeconds);
        if (payload.phase === 'VOTING') {
          triggerHappyTime();
        }
        break;

      case 'SYNC_STROKE':
        setRemoteStrokes((prev) => [...prev, payload]);
        break;

      case 'CANVAS_CLEARED':
        setRemoteStrokes([]);
        setClearSignal((prev) => prev + 1);
        break;

      case 'CHAT_MESSAGE':
        setChatMessages((prev) => [...prev, payload]);
        break;

      case 'VOTE_REGISTERED':
        if (payload.voterId === myPlayerId) {
          setHasVoted(true);
        }
        break;

      case 'ROUND_RESULTS':
        setRoundResults(payload);
        setCurrentPhase('RESULTS');
        if (payload.totalScores && payload.totalScores[myPlayerId] !== undefined) {
          const myDelta = payload.scoreDeltas[myPlayerId] || 0;
          setProfile((prev) => ({
            ...prev,
            matchesPlayed: prev.matchesPlayed + 1,
            matchesWon: myDelta > 0 ? prev.matchesWon + 1 : prev.matchesWon
          }));
        }
        break;

      case 'ERROR':
        alert(payload.message || 'Error occurred');
        break;

      default:
        break;
    }
  };

  const handleQuickMatch = () => {
    connectWebSocket(() => {
      sendWSMessage('JOIN_QUEUE', {
        name: profile.name,
        avatar: profile.avatar
      });
      setIsCustomRoom(false);
      setQueueWaiting(1);
      setScreen('LOBBY');
    });
  };

  const handleCreateRoom = () => {
    connectWebSocket(() => {
      sendWSMessage('CREATE_ROOM', {
        name: profile.name,
        avatar: profile.avatar
      });
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInputCode.trim()) return;
    connectWebSocket(() => {
      sendWSMessage('JOIN_ROOM', {
        name: profile.name,
        avatar: profile.avatar,
        code: joinInputCode.trim().toUpperCase()
      });
    });
  };

  const handleStartGame = () => {
    sendWSMessage('START_GAME');
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomCode).catch(() => {});
  };

  const handleLeaveLobby = () => {
    sendWSMessage('LEAVE_ROOM');
    setScreen('MENU');
  };

  const handleSendStroke = (stroke: StrokeData) => {
    sendWSMessage('DRAW_STROKE', stroke);
  };

  const handleEndStroke = () => {
    sendWSMessage('END_STROKE');
  };

  const handleSendMessage = (text: string) => {
    sendWSMessage('SEND_CHAT', { message: text });
  };

  const handleCastVote = (targetPlayerId: string) => {
    if (hasVoted) return;
    setVotedTargetId(targetPlayerId);
    sendWSMessage('CAST_VOTE', { targetPlayerId });
  };

  const handleReturnToMenu = () => {
    triggerGameplayStop();
    if (wsRef.current) {
      wsRef.current.close();
    }
    setScreen('MENU');
  };

  const level = 1 + Math.floor(profile.matchesPlayed / 3);

  return (
    <div className="w-full h-full min-h-screen flex flex-col">
      {/* App Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 pt-4">
        {screen === 'MENU' ? (
          <div />
        ) : (
          <button
            onClick={handleReturnToMenu}
            className="btn btn-secondary btn-sm"
            aria-label="Back to menu"
          >
            <ArrowLeft size={16} />
            <span className="logo !rotate-0 !text-lg">Fake<em>Art</em>.io</span>
          </button>
        )}

        <div className="flex items-stretch card !rounded-2xl !shadow-[0_4px_0_0_var(--color-ink)]">
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-3 pl-2 pr-4 py-1.5 cursor-pointer hover:bg-grape-soft/60 rounded-l-2xl transition-colors"
          >
            <span className="w-10 h-10 rounded-full bg-grape-soft border-2 border-grape flex items-center justify-center text-xl">
              {profile.avatar}
            </span>
            <span className="text-left leading-tight">
              <span className="block font-bold text-sm">{profile.name}</span>
              <span className="block text-xs font-semibold text-ink-soft">Lv. {level}</span>
            </span>
          </button>
          <button
            onClick={() => setShowProfile(true)}
            aria-label="Settings"
            className="px-3.5 border-l-2 border-ink/15 rounded-r-2xl cursor-pointer hover:bg-grape-soft/60 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Screen Router */}
      <main className="flex-1 flex items-center justify-center p-4">
        {screen === 'MENU' && (
          <div className="flex flex-col items-center gap-9 w-full max-w-sm -mt-10 pop-in">
            {/* Logo */}
            <div className="relative px-6">
              <span className="logo-spark -left-1 top-2 rotate-[30deg]" />
              <span className="logo-spark -right-1 top-3 -rotate-[30deg]" />
              <h1 className="logo wobble text-6xl sm:text-7xl">
                Fake<em>Art</em>.io
              </h1>
            </div>

            <div className="flex flex-col gap-4 w-full">
              <button onClick={handleQuickMatch} className="btn btn-primary w-full py-4 text-2xl">
                <Play size={26} fill="currentColor" />
                Play
              </button>

              <button onClick={handleCreateRoom} className="btn btn-secondary w-full py-3.5 text-lg">
                <Plus size={22} strokeWidth={3} />
                Create Room
              </button>

              {showJoin ? (
                <form onSubmit={handleJoinRoom} className="flex gap-2.5 w-full pop-in">
                  <input
                    autoFocus
                    type="text"
                    placeholder="ROOM CODE"
                    value={joinInputCode}
                    onChange={(e) => setJoinInputCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="input flex-1 text-center tracking-[0.3em] uppercase !py-3.5"
                  />
                  <button type="submit" className="btn btn-primary px-5" aria-label="Join">
                    <LogIn size={22} />
                  </button>
                </form>
              ) : (
                <button onClick={() => setShowJoin(true)} className="btn btn-secondary w-full py-3.5 text-lg">
                  <Link2 size={22} strokeWidth={2.5} />
                  Join Room
                </button>
              )}
            </div>

            {connError && (
              <p className="text-cherry text-sm font-bold text-center">{connError}</p>
            )}

            <p className="text-ink-soft text-sm font-semibold text-center max-w-xs leading-relaxed">
              One stroke each. One of you has a different word.
              Spot the Fake Artist!
            </p>
          </div>
        )}

        {screen === 'LOBBY' && (
          <div className="card p-8 max-w-md w-full flex flex-col gap-6 items-center text-center pop-in">
            <div className="w-16 h-16 rounded-full bg-grape-soft border-2 border-ink flex items-center justify-center text-grape-dark">
              <Users size={30} />
            </div>

            <div>
              <h3 className="font-display text-3xl font-bold">
                {isCustomRoom ? (
                  <>Room <span className="text-grape tracking-widest">{roomCode}</span></>
                ) : (
                  'Finding a match…'
                )}
              </h3>
              <p className="text-ink-soft text-sm font-semibold mt-1">
                {isCustomRoom
                  ? `Players (${players.length}/4)`
                  : `${queueWaiting}/4 players found`}
              </p>
            </div>

            {/* Slot indicators */}
            <div className="flex gap-3 justify-center w-full">
              {[0, 1, 2, 3].map((idx) => {
                const p = isCustomRoom
                  ? players[idx]
                  : idx < queueWaiting ? { avatar: idx === 0 ? profile.avatar : '🎨', name: idx === 0 ? 'You' : 'Artist', id: String(idx) } : undefined;
                return (
                  <div
                    key={idx}
                    className={`w-[72px] h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      p
                        ? 'border-ink bg-grape-soft shadow-[0_3px_0_0_var(--color-ink)]'
                        : 'border-dashed border-ink/30 bg-white/60'
                    }`}
                  >
                    <span className="text-3xl">{p ? p.avatar : '?'}</span>
                    <span className="text-[11px] font-bold text-ink-soft truncate max-w-[60px]">
                      {p ? p.name : 'Waiting'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 w-full">
              {isCustomRoom && (
                <>
                  <button onClick={handleCopyCode} className="btn btn-secondary w-full py-3 text-base">
                    <Copy size={18} />
                    Copy Room Code
                  </button>
                  {myPlayerId === hostId ? (
                    <button
                      onClick={handleStartGame}
                      disabled={players.length < 3}
                      className="btn btn-primary w-full py-3 text-lg"
                    >
                      <Play size={20} fill="currentColor" />
                      {players.length < 3 ? 'Need 3+ players' : 'Start Game'}
                    </button>
                  ) : (
                    <p className="text-ink-soft text-sm font-semibold">Waiting for the host to start…</p>
                  )}
                </>
              )}

              <button onClick={handleLeaveLobby} className="btn btn-secondary w-full py-3 text-base !text-cherry">
                {isCustomRoom ? 'Leave Room' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {screen === 'GAME' && (
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_300px] gap-5 w-full max-w-7xl mx-auto p-2 sm:p-4 pop-in">
            {/* Left Column: Player Cards */}
            <div className="flex flex-col gap-3 order-2 md:order-1">
              <div className="font-display text-sm font-semibold text-ink-soft flex justify-between tracking-wider uppercase px-1">
                <span>Players</span>
                {maxMatches > 1 && <span>Match {roundNumber}/{maxMatches}</span>}
              </div>
              {players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  isCurrentDrawer={p.id === activeDrawerId && currentPhase === 'DRAWING'}
                  isSelf={p.id === myPlayerId}
                  currentPhase={currentPhase}
                  onVote={handleCastVote}
                  hasVoted={hasVoted}
                  votedTargetId={votedTargetId}
                />
              ))}
            </div>

            {/* Center Column: Phase bar + Canvas */}
            <div className="flex flex-col gap-4 items-center w-full order-1 md:order-2">
              <div className="card !rounded-2xl px-4 py-2.5 flex items-center justify-between w-full max-w-[520px]">
                <div className="flex items-center gap-2 min-w-[64px]">
                  <Clock size={20} className="text-grape-dark" />
                  <span className="font-display font-bold text-xl tabular-nums">
                    {phaseTimeLeft}s
                  </span>
                </div>

                <div className="text-center">
                  <span className="font-display font-semibold text-ink-soft">
                    Your word:{' '}
                    <strong className="text-grape-dark font-bold text-lg">{secretWord}</strong>
                  </span>
                </div>

                <div className={`chip !text-[11px] !px-2 !py-1 ${
                  currentPhase === 'DRAWING' ? 'bg-grape-soft text-grape-dark' : 'bg-sun/30 text-ink'
                }`}>
                  {currentPhase === 'DRAWING' ? `Round ${drawRound}/${totalDrawRounds}` : currentPhase}
                </div>
              </div>

              <DrawingCanvas
                isMyTurn={myPlayerId === activeDrawerId && currentPhase === 'DRAWING'}
                onSendStroke={handleSendStroke}
                onEndStroke={handleEndStroke}
                remoteStrokes={remoteStrokes}
                clearSignal={clearSignal}
              />
            </div>

            {/* Right Column: Chat Panel */}
            <div className="flex flex-col order-3">
              <ChatPanel
                currentPhase={currentPhase}
                chatMessages={chatMessages}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}
      </main>

      {/* Results Modal */}
      {currentPhase === 'RESULTS' && roundResults && (
        <ResultsModal
          results={roundResults}
          players={players}
          onNextMatch={handleReturnToMenu}
        />
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          profile={profile}
          onSaveProfile={(updated) => setProfile(updated)}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
