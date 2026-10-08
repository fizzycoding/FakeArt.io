import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Users, Plus, Link2, LogIn, Copy, ArrowLeft, CircleHelp
} from 'lucide-react';
import GameScreen from './components/GameScreen';
import Stage from './components/Stage';
import ResultsModal from './components/ResultsModal';
import ProfileModal from './components/ProfileModal';
import HowToPlayModal from './components/HowToPlayModal';
import MatchmakingScreen from './components/MatchmakingScreen';
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
  const [showHowTo, setShowHowTo] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinInputCode, setJoinInputCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [connError, setConnError] = useState('');
  const [isCustomRoom, setIsCustomRoom] = useState(false);
  const [hostId, setHostId] = useState('');
  const [queuePlayers, setQueuePlayers] = useState<Player[]>([]);
  const [matchFound, setMatchFound] = useState(false);
  const [leftIds, setLeftIds] = useState<string[]>([]);
  const [matchCountdown, setMatchCountdown] = useState(5);
  
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

  useEffect(() => {
    if (!matchFound || matchCountdown <= 0) return;
    const t = setTimeout(() => setMatchCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [matchFound, matchCountdown]);

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
      if (wsRef.current === ws) {
        wsRef.current = null;
        setScreen('MENU');
      }
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
        setQueuePlayers(payload.players || []);
        break;

      case 'MATCH_FOUND':
        setQueuePlayers(payload.players || []);
        setMatchCountdown(payload.countdown || 5);
        setMatchFound(true);
        break;

      case 'PLAYER_LEFT':
        setLeftIds((prev) => (prev.includes(payload.playerId) ? prev : [...prev, payload.playerId]));
        break;

      case 'GAME_ABORTED':
        setMatchFound(false);
        setConnError(payload.message || 'The game ended.');
        triggerGameplayStop();
        setCurrentPhase('LOBBY');
        wsRef.current?.close();
        break;

      case 'START_ROUND':
        setMatchFound(false);
        setLeftIds([]);
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

      case 'SYNC_GAME':
        // Joined a game already in progress: adopt its current state.
        setMatchFound(false);
        setLeftIds([]);
        triggerGameplayStart();
        setSecretWord(payload.word || '');
        setRoundNumber(payload.roundNumber || 1);
        setMaxMatches(payload.maxMatches || 5);
        setPlayers(payload.players || []);
        setCurrentPhase(payload.phase || 'DRAWING');
        setPhaseTimeLeft(payload.durationSecs || 0);
        setActiveDrawerId(payload.activeDrawerId || '');
        setDrawRound(payload.drawRound || 1);
        setTotalDrawRounds(payload.totalRounds || 4);
        setRemoteStrokes(payload.strokes || []);
        setChatMessages([]);
        setHasVoted(false);
        setVotedTargetId('');
        setRoundResults(null);
        setScreen('GAME');
        break;

      case 'PLAYER_JOINED':
        setPlayers(payload.players || []);
        setLeftIds([]);
        break;

      case 'CHAT_MESSAGE':
        setChatMessages((prev) => [...prev, payload]);
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

      case 'VOTE_REGISTERED':
        if (payload.voterId === myPlayerId) {
          setHasVoted(true);
        }
        break;

      case 'ROUND_RESULTS':
        setRoundResults(payload);
        setCurrentPhase('RESULTS');
        if (payload.isGameOver && payload.totalScores && payload.totalScores[myPlayerId] !== undefined) {
          const best = Math.max(...(Object.values(payload.totalScores) as number[]));
          const won = payload.totalScores[myPlayerId] === best;
          setProfile((prev) => ({
            ...prev,
            matchesPlayed: prev.matchesPlayed + 1,
            matchesWon: won ? prev.matchesWon + 1 : prev.matchesWon
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
      setQueuePlayers([]);
      setMatchFound(false);
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
    setMatchFound(false);
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
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    setMatchFound(false);
    setCurrentPhase('LOBBY');
    setRoundResults(null);
    setPlayers([]);
    setQueuePlayers([]);
    setLeftIds([]);
    setRemoteStrokes([]);
    setChatMessages([]);
    setHasVoted(false);
    setVotedTargetId('');
    setConnError('');
    setScreen('MENU');
  };

  const inMatchmaking = screen === 'LOBBY' && !isCustomRoom;
  const stageBg = screen === 'GAME' ? 'game-bg' : inMatchmaking ? 'match-bg' : '';

  return (
    <Stage bgClass={stageBg}>
    <div className="w-full h-full flex flex-col">
      {/* App Header */}
      {screen !== 'GAME' && !inMatchmaking && (
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

        <button
          onClick={() => setShowProfile(true)}
          className="card !rounded-3xl !shadow-[0_5px_0_0_var(--color-ink)] flex items-center gap-4 pl-3 pr-6 py-3 cursor-pointer hover:bg-grape-soft/60 transition-colors"
        >
          <span className="w-16 h-16 rounded-full bg-grape-soft border-[3px] border-grape flex items-center justify-center text-4xl">
            {profile.avatar}
          </span>
          <span className="text-left leading-tight">
            <span className="block font-bold text-2xl">{profile.name}</span>
          </span>
        </button>
      </header>
      )}

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

              <button onClick={() => setShowHowTo(true)} className="btn btn-secondary w-full py-3.5 text-lg">
                <CircleHelp size={22} strokeWidth={2.5} />
                How to Play
              </button>
            </div>

            {connError && (
              <p className="text-cherry text-sm font-bold text-center">{connError}</p>
            )}

            <p className="text-ink-soft text-sm font-semibold text-center max-w-xs leading-relaxed">
              Two strokes each. One of you has a different word.
              Spot the Fake Artist!
            </p>
          </div>
        )}

        {screen === 'LOBBY' && !isCustomRoom && (
          <MatchmakingScreen
            players={queuePlayers}
            self={{ id: myPlayerId, name: profile.name, avatar: profile.avatar }}
            matchFound={matchFound}
            countdown={matchCountdown}
            error={connError}
            onCancel={handleLeaveLobby}
          />
        )}

        {screen === 'LOBBY' && isCustomRoom && (
          <div className="card p-8 max-w-md w-full flex flex-col gap-6 items-center text-center pop-in">
            <div className="w-16 h-16 rounded-full bg-grape-soft border-2 border-ink flex items-center justify-center text-grape-dark">
              <Users size={30} />
            </div>

            <div>
              <h3 className="font-display text-3xl font-bold">
                Room <span className="text-grape tracking-widest">{roomCode}</span>
              </h3>
              <p className="text-ink-soft text-sm font-semibold mt-1">
                {`Players (${players.length}/4)`}
              </p>
            </div>

            {/* Slot indicators */}
            <div className="flex gap-3 justify-center w-full">
              {[0, 1, 2, 3].map((idx) => {
                const p = players[idx];
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
          <GameScreen
            players={players}
            myPlayerId={myPlayerId}
            activeDrawerId={activeDrawerId}
            currentPhase={currentPhase}
            phaseTimeLeft={phaseTimeLeft}
            secretWord={secretWord}
            drawRound={drawRound}
            totalDrawRounds={totalDrawRounds}
            roundNumber={roundNumber}
            maxMatches={maxMatches}
            leftIds={leftIds}
            hasVoted={hasVoted}
            votedTargetId={votedTargetId}
            onVote={handleCastVote}
            chatMessages={chatMessages}
            onSendMessage={handleSendMessage}
            remoteStrokes={remoteStrokes}
            clearSignal={clearSignal}
            onSendStroke={handleSendStroke}
            onEndStroke={handleEndStroke}
          />
        )}
      </main>

      {/* Results Modal */}
      {currentPhase === 'RESULTS' && roundResults && (
        <ResultsModal
          results={roundResults}
          players={players}
          roundNumber={roundNumber}
          maxRounds={maxMatches}
          onReturnHome={handleReturnToMenu}
        />
      )}

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          profile={profile}
          onSaveProfile={(updated) => setProfile(updated)}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
    </Stage>
  );
}
