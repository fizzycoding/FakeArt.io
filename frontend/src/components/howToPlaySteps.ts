import { Lock, MessageCircle, Pencil, Trophy, type LucideIcon } from 'lucide-react';

export interface HowToStep {
  icon: LucideIcon;
  title: string;
  text: string;
}

// The rules in a few short steps: one idea each, a two-word title and a single
// sentence. Shown on first play and again from the How to Play button.
export const TUTORIAL_STEPS: HowToStep[] = [
  {
    icon: Lock,
    title: 'Secret word',
    text: 'Everyone gets the same word, except one: the Fake Artist.',
  },
  {
    icon: Pencil,
    title: 'Take turns',
    text: 'Draw 2 strokes to show your word.',
  },
  {
    icon: MessageCircle,
    title: 'Chat & vote',
    text: 'Find the Fake Artist and vote. Votes are final!',
  },
  {
    icon: Trophy,
    title: 'Win',
    text: 'Catch them to score. Most points after 5 rounds wins!',
  },
];
