import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { TUTORIAL_STEPS } from './howToPlaySteps';

interface TutorialModalProps {
  /** The player went through every step. */
  onComplete: () => void;
  /** The player chose to skip (or close) the tutorial. */
  onSkip: () => void;
  /** Label for the skip link: "Skip" on first play, "Close" when opened from How to Play. */
  skipLabel?: string;
}

/** Walkthrough of the rules, one step at a time. */
export default function TutorialModal({ onComplete, onSkip, skipLabel = 'Skip' }: TutorialModalProps) {
  const [index, setIndex] = useState(0);
  const step = TUTORIAL_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === TUTORIAL_STEPS.length - 1;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <div className="absolute -inset-[100%] -z-10 bg-ink/50 backdrop-blur-sm" />

      <div className="card p-8 w-full max-w-lg flex flex-col gap-6 pop-in">
        <div className="flex items-center justify-between">
          <span className="chip bg-grape-soft text-grape-dark !text-xs !px-2 !py-1">
            Step {index + 1} of {TUTORIAL_STEPS.length}
          </span>
          <button
            onClick={onSkip}
            className="text-sm font-bold text-ink-soft hover:text-ink underline underline-offset-2 cursor-pointer"
          >
            {skipLabel}
          </button>
        </div>

        {/* key restarts the pop-in so each step feels like a fresh card */}
        <div key={index} className="flex flex-col items-center text-center gap-4 pop-in min-h-[170px] justify-center">
          <span className="w-20 h-20 rounded-full bg-grape-soft border-2 border-ink flex items-center justify-center text-grape-dark">
            <Icon size={38} strokeWidth={2.2} />
          </span>
          <h2 className="font-display text-3xl font-bold">{step.title}</h2>
          <p className="text-xl font-semibold text-ink-soft leading-snug max-w-sm">{step.text}</p>
        </div>

        <div className="flex justify-center gap-2" aria-hidden="true">
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2.5 rounded-full transition-all ${i === index ? 'w-7 bg-grape' : 'w-2.5 bg-ink/20'}`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {!isFirst && (
            <button onClick={() => setIndex(index - 1)} className="btn btn-secondary flex-1 py-3 text-lg">
              <ArrowLeft size={20} />
              Back
            </button>
          )}
          {isLast ? (
            <button onClick={onComplete} className="btn btn-primary flex-1 py-3 text-lg">
              <Check size={22} strokeWidth={3} />
              Complete
            </button>
          ) : (
            <button onClick={() => setIndex(index + 1)} className="btn btn-primary flex-1 py-3 text-lg">
              Next
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
