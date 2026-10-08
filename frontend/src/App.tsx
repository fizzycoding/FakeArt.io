import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Users, Plus, Link2, LogIn, Copy, ArrowLeft, CircleHelp, Video, Loader2
} from 'lucide-react';
import GameScreen from './components/GameScreen';
import Stage from './components/Stage';
import ResultsModal from './components/ResultsModal';
import ProfileModal from './components/ProfileModal';
import HowToPlayModal from './components/HowToPlayModal';
import { startBackgroundMusic } from './utils/music';
import { initSfx, sfx } from './utils/sfx';
import Avatar from './components/Avatar';
import { DEFAULT_AVATAR, loadAvatarList, normalizeAvatar } from './utils/avatars';
import MatchmakingScreen from './components/MatchmakingScreen';
import { 
  Player, StrokeData, ChatMessage, RoundResults, PlayerProfile, GamePhase 
} from './types/game';
import {
  initCrazyGamesSDK, isSdkUsable, loadingStart, loadingStop, triggerGameplayStart, triggerGameplayStop,
  triggerHappyTime, requestRewardedAd, hasAdblock, isChatDisabled, getCrazyGamesUsername, shareRoom,
  leaveSharedRoom, getInviteLink, getInviteRoomCode, onInviteJoin, AdFailure,
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
    // Browsers can block storage inside an embedded game, so never let it throw.
    try {
      const saved = localStorage.getItem('fakeart_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, avatar: normalizeAvatar(parsed.avatar) };
      }
    } catch {
      // fall through to a fresh profile
    }
    return {
      name: 'Artist_' + Math.floor(1000 + Math.random() * 9000),
      avatar: DEFAULT_AVATAR,
      matchesPlayed: 0,
      matchesWon: 0
    };
  });

  const [showProfile, setShowProfile] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [adGated, setAdGated] = useState(false); // Create Room costs a rewarded ad (CrazyGames SDK active)
  const [adBusy, setAdBusy] = useState(false); // an ad is loading or playing: block the UI
  const [adblocked, setAdblocked] = useState(false);
  const [adNotice, setAdNotice] = useState('');
  const [chatOff, setChatOff] = useState(false);
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
  const [votedIds, setVotedIds] = useState<string[]>([]);
  // The socket handlers are created once, so they read the player id from a ref.
  const myIdRef = useRef('');
  const roomCodeRef = useRef('');
  const profileRef = useRef<PlayerProfile | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    startBackgroundMusic();
    initSfx();
  }, []);

  // CrazyGames SDK start-up: report loading, learn what the platform allows,
  // use the player's CrazyGames name, and honour invite links.
  useEffect(() => {
    let alive = true;
    (async () => {
      loadingStart();
      await initCrazyGamesSDK();

      const cgName = await getCrazyGamesUsername();
      if (alive && cgName) {
        // Show the CrazyGames username so friends recognise each other, unless the player chose their own.
        setProfile((prev) => (/^Artist_\d+$/.test(prev.name) ? { ...prev, name: cgName.slice(0, 15) } : prev));
      }
      if (alive) {
        setAdGated(isSdkUsable());
        setChatOff(isChatDisabled());
      }

      await loadAvatarList();
      loadingStop();

      onInviteJoin((code) => {
        handleReturnToMenu();
        joinRoomByCode(code);
      });
      const invited = getInviteRoomCode();
      if (alive && invited) joinRoomByCode(invited);

      if (alive) setAdblocked(await hasAdblock());
    })();
    return () => {
      alive = false;
    };
    // Runs once; the handlers it calls only use refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem('fakeart_profile', JSON.stringify(profile));
    } catch {
      // storage unavailable: the profile just won't persist
    }
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
    sfx.tick();
    const t = setTimeout(() => setMatchCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [matchFound, matchCountdown]);

  // Tick through the last seconds of your own turn and of voting.
  useEffect(() => {
    if (screen !== 'GAME' || phaseTimeLeft <= 0 || phaseTimeLeft > 5) return;
    const myTurn = currentPhase === 'DRAWING' && activeDrawerId === myPlayerId;
    if (myTurn || currentPhase === 'VOTING') sfx.tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the clock should trigger a tick
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
        myIdRef.current = payload.id;
        setMyPlayerId(payload.id);
        break;

      case 'ROOM_CREATED':
      case 'JOIN_SUCCESS':
        roomCodeRef.current = payload.code;
        shareRoom(payload.code, (payload.players || []).length < 4);
        setRoomCode(payload.code);
        setPlayers(payload.players || []);
        setHostId(payload.hostId || '');
        setIsCustomRoom(true);
        setScreen('LOBBY');
        break;

      case 'LOBBY_UPDATE':
        if (roomCodeRef.current) shareRoom(roomCodeRef.current, (payload.players || []).length < 4);
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
        sfx.matchFound();
        break;

      case 'PLAYER_LEFT':
        sfx.playerLeft();
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
        if (roomCodeRef.current) shareRoom(roomCodeRef.current, false); // started: friends can't join mid-game
        sfx.roundStart();
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
        setVotedIds([]);
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
        setVotedIds(payload.voted || []);
        setVotedTargetId('');
        setRoundResults(null);
        setScreen('GAME');
        break;

      case 'PLAYER_JOINED':
        sfx.blip();
        setPlayers(payload.players || []);
        setLeftIds([]);
        break;

      case 'CHAT_MESSAGE':
        if (payload.senderId !== myIdRef.current) sfx.message();
        setChatMessages((prev) => [...prev, payload]);
        break;

      case 'TURN_CHANGE':
        if (payload.drawerId === myIdRef.current) sfx.yourTurn();
        setActiveDrawerId(payload.drawerId);
        setDrawRound(payload.drawRound || 1);
        setTotalDrawRounds(payload.totalRounds || 4);
        setPhaseTimeLeft(payload.durationSecs || 15);
        break;

      case 'PHASE_CHANGE':
        setCurrentPhase(payload.phase);
        setPhaseTimeLeft(payload.durationSeconds);
        if (payload.phase === 'VOTING') {
          sfx.votingStart();
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
        setVotedIds((prev) => (prev.includes(payload.voterId) ? prev : [...prev, payload.voterId]));
        if (payload.voterId === myIdRef.current) {
          setHasVoted(true);
          sfx.voteCast();
        } else {
          sfx.blip();
        }
        break;

      case 'ROUND_RESULTS':
        triggerGameplayStop(); // the results screen is a break in play
        if (payload.isGameOver) sfx.victory();
        else sfx.roundEnd();
        setRoundResults(payload);
        setCurrentPhase('RESULTS');
        if (payload.isGameOver && payload.totalScores && payload.totalScores[myIdRef.current] !== undefined) {
          const best = Math.max(...(Object.values(payload.totalScores) as number[]));
          const won = payload.totalScores[myIdRef.current] === best;
          if (won) triggerHappyTime(); // a special moment: winning the whole game
          setProfile((prev) => ({
            ...prev,
            matchesPlayed: prev.matchesPlayed + 1,
            matchesWon: won ? prev.matchesWon + 1 : prev.matchesWon
          }));
        }
        break;

      case 'ERROR':
        // Shown on the page; browser alerts are blocked inside CrazyGames' frame.
        setConnError(payload.message || 'Something went wrong. Please try again.');
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

  const adFailureMessage = (reason: AdFailure): string => {
    switch (reason) {
      case 'adblock':
        return 'Create Room needs a short ad, and your adblocker is blocking it. Turn it off to create rooms.';
      case 'unfilled':
        return 'No ad is available right now. Please try again in a moment.';
      case 'cooldown':
        return 'Ads are cooling down. Please try again in a minute.';
      default:
        return "The ad couldn't play. Please try again.";
    }
  };

  // Creating a private room is the rewarded-ad perk: watch one ad, get a room.
  // If the ad doesn't play, no room; Play and Join Room still work for everyone.
  const handleCreateRoom = async () => {
    if (adBusy) return;
    setAdNotice('');
    setConnError('');

    if (adGated) {
      setAdBusy(true);
      const result = await requestRewardedAd();
      setAdBusy(false);
      if (result.granted === false) {
        setAdNotice(adFailureMessage(result.reason));
        if (result.reason === 'adblock') setAdblocked(true);
        return;
      }
      if (result.watched) sfx.matchFound(); // a clear "unlocked" cue
    }

    connectWebSocket(() => {
      sendWSMessage('CREATE_ROOM', {
        name: profile.name,
        avatar: profile.avatar
      });
    });
  };

  const joinRoomByCode = (code: string) => {
    const me = profileRef.current;
    connectWebSocket(() => {
      sendWSMessage('JOIN_ROOM', {
        name: me?.name,
        avatar: me?.avatar,
        code: code.trim().toUpperCase()
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

  const handleCopyInvite = () => {
    const link = getInviteLink(roomCode);
    navigator.clipboard?.writeText(link ?? roomCode).catch(() => {});
  };

  const handleLeaveLobby = () => {
    sendWSMessage('LEAVE_ROOM');
    roomCodeRef.current = '';
    leaveSharedRoom();
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
    setHasVoted(true); // votes are final, so lock right away
    sendWSMessage('CAST_VOTE', { targetPlayerId });
  };

  const handleReturnToMenu = () => {
    triggerGameplayStop();
    roomCodeRef.current = '';
    leaveSharedRoom();
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
    setVotedIds([]);
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
            <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="FakeArt.io" draggable={false} className="h-7 w-auto" />
          </button>
        )}

        <button
          onClick={() => setShowProfile(true)}
          className="card !rounded-3xl !shadow-[0_5px_0_0_var(--color-ink)] flex items-center gap-4 pl-3 pr-6 py-3 cursor-pointer hover:bg-grape-soft/60 transition-colors"
        >
          <span className="w-16 h-16 rounded-full bg-grape-soft border-[3px] border-grape overflow-hidden">
            <Avatar id={profile.avatar} />
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
            <h1>
              <img
                src={`${import.meta.env.BASE_URL}logo.webp`}
                alt="FakeArt.io"
                draggable={false}
                className="w-[400px] max-w-none h-auto select-none"
              />
            </h1>

            <div className="flex flex-col gap-4 w-full">
              <button onClick={handleQuickMatch} className="btn btn-primary w-full py-4 text-2xl">
                <Play size={26} fill="currentColor" />
                Play
              </button>

              <button
                onClick={handleCreateRoom}
                disabled={adBusy || (adGated && adblocked)}
                aria-label={adGated ? 'Create Room (watch a short ad)' : 'Create Room'}
                className="btn btn-secondary w-full py-3.5 text-lg"
              >
                <Plus size={22} strokeWidth={3} />
                Create Room
                {adGated && (
                  <span
                    title="Watch a short ad to create a room"
                    className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-grape text-white border-2 border-ink flex items-center justify-center"
                  >
                    <Video size={16} strokeWidth={2.5} />
                  </span>
                )}
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

            {(connError || adNotice || (adGated && adblocked)) && (
              <p className="text-cherry text-sm font-bold text-center max-w-sm">
                {connError ||
                  adNotice ||
                  'Create Room needs a short ad, and your adblocker is blocking it. Play and Join Room still work.'}
              </p>
            )}
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
                    {p ? <Avatar id={p.avatar} className="w-10 h-10 border-2 border-ink" /> : <span className="text-3xl">?</span>}
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
                  <div className="flex gap-3">
                    <button onClick={handleCopyCode} className="btn btn-secondary flex-1 py-3 text-base">
                      <Copy size={18} />
                      Copy Code
                    </button>
                    {isSdkUsable() && (
                      <button onClick={handleCopyInvite} className="btn btn-secondary flex-1 py-3 text-base">
                        <Link2 size={18} />
                        Copy Invite Link
                      </button>
                    )}
                  </div>
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
            votedIds={votedIds}
            votedTargetId={votedTargetId}
            onVote={handleCastVote}
            chatMessages={chatMessages}
            chatDisabled={chatOff}
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

      {adBusy && (
        <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-ink/40 backdrop-blur-sm">
          <Loader2 size={44} className="animate-spin text-white" />
          <p className="font-display text-xl font-bold text-white">Loading ad…</p>
        </div>
      )}
    </div>
    </Stage>
  );
}
