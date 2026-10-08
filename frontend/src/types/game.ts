export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
}

export interface StrokeData {
  x: number;
  y: number;
  color: string;
  width: number;
  isNewStroke: boolean;
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

export interface RoundResults {
  impostorId: string;
  word: string;
  impostorWord: string;
  votes: Record<string, string>;
  scoreDeltas: Record<string, number>;
  totalScores: Record<string, number>;
  isGameOver: boolean;
}

export interface PlayerProfile {
  name: string;
  avatar: string;
  matchesPlayed: number;
  matchesWon: number;
}

export type GamePhase = 'LOBBY' | 'DRAWING' | 'VOTING' | 'RESULTS';
