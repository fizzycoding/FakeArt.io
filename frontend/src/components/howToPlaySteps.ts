import { Lock, MessageCircle, Pencil, Star, Trophy, VenetianMask, type LucideIcon } from 'lucide-react';

export interface HowToStep {
  icon: LucideIcon;
  title: string;
  text: string;
}

// The rules in simple words. Used by both the How to Play popup and the
// first-time tutorial so they never disagree.
export const HOW_TO_PLAY_STEPS: HowToStep[] = [
  {
    icon: Lock,
    title: 'Get your word',
    text: 'Everyone gets a secret word. But one player, the Fake Artist, gets a different word that is a bit similar.',
  },
  {
    icon: Pencil,
    title: 'Take turns drawing',
    text: 'On your turn, draw 2 strokes on the shared canvas. You have 12 seconds. Show your word, but don’t make it too obvious!',
  },
  {
    icon: VenetianMask,
    title: 'Fake Artist? Blend in',
    text: 'You don’t know the real word. Watch the others and draw something that fits in.',
  },
  {
    icon: MessageCircle,
    title: 'Chat and vote',
    text: 'After everyone draws, talk it out and vote for who you think is the Fake Artist. You get 2 minutes, and your vote is final.',
  },
  {
    icon: Star,
    title: 'Score points',
    text: 'Vote for the Fake Artist and get +100. The Fake Artist gets +150 if nobody catches them. Missed? You just get 0. No points are ever lost!',
  },
  {
    icon: Trophy,
    title: 'Win the game',
    text: 'A game has 5 rounds. The player with the most points at the end wins!',
  },
];
