import { X } from 'lucide-react';

interface HowToPlayModalProps {
  onClose: () => void;
}

const STEPS = [
  {
    icon: '🤫',
    title: 'Get your word',
    text: 'Everyone gets a secret word. But one player, the Fake Artist, gets a different word that is a bit similar.',
  },
  {
    icon: '✏️',
    title: 'Take turns drawing',
    text: 'On your turn, draw 2 strokes on the shared canvas. Show your word, but don’t make it too obvious!',
  },
  {
    icon: '🕵️',
    title: 'Fake Artist? Blend in',
    text: 'You don’t know the real word. Watch the others and draw something that fits in.',
  },
  {
    icon: '💬',
    title: 'Chat and vote',
    text: 'After everyone draws, talk it out and vote for who you think is the Fake Artist. You have 2 minutes.',
  },
  {
    icon: '⭐',
    title: 'Score points',
    text: 'Vote for the Fake Artist and get +100. The Fake Artist gets +150 if nobody catches them. Missed? You just get 0. No points are ever lost!',
  },
  {
    icon: '🏆',
    title: 'Win the game',
    text: 'A game has 5 rounds. The player with the most points at the end wins!',
  },
];

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="absolute -inset-[100%] -z-10 bg-ink/50 backdrop-blur-sm" />
      <div
        className="card p-6 w-full max-w-2xl flex flex-col gap-4 pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="font-display text-3xl font-bold">
            How to <span className="text-grape">Play</span>
          </h2>
          <button onClick={onClose} aria-label="Close" className="btn btn-secondary btn-sm !p-2">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card-soft !border-ink/30 p-3 flex gap-3 items-start">
              <span className="w-11 h-11 shrink-0 rounded-full bg-grape-soft border-2 border-ink flex items-center justify-center text-2xl">
                {s.icon}
              </span>
              <div>
                <div className="font-display font-bold text-base leading-tight">
                  {i + 1}. {s.title}
                </div>
                <p className="text-sm font-semibold text-ink-soft leading-snug mt-0.5">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="btn btn-primary w-full py-3 text-lg">
          Got it!
        </button>
      </div>
    </div>
  );
}
