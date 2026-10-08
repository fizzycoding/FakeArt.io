import { X } from 'lucide-react';
import { HOW_TO_PLAY_STEPS } from './howToPlaySteps';

interface HowToPlayModalProps {
  onClose: () => void;
}

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
          {HOW_TO_PLAY_STEPS.map((s, i) => (
            <div key={s.title} className="card-soft !border-ink/30 p-3 flex gap-3 items-start">
              <span className="w-11 h-11 shrink-0 rounded-full bg-grape-soft border-2 border-ink flex items-center justify-center text-grape-dark">
                <s.icon size={22} strokeWidth={2.2} />
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
