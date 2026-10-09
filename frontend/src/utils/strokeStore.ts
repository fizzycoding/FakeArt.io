import { StrokeData } from '../types/game';

// The drawing lives outside React on purpose. A line is hundreds of points arriving
// many times a second, and re-rendering the whole app for each one (or redrawing the
// whole canvas) makes drawing feel laggy. Instead the canvas subscribes here and
// paints each new point exactly once.

export interface StrokeListener {
  /** One new point arrived. */
  onPoint: (point: StrokeData) => void;
  /** The whole drawing was replaced or wiped (new round, joined mid-game). */
  onReset: (all: StrokeData[]) => void;
}

let strokes: StrokeData[] = [];
const listeners = new Set<StrokeListener>();

export const strokeStore = {
  /** Every point of the current round, in order. */
  all: (): StrokeData[] => strokes,

  add(point: StrokeData): void {
    strokes.push(point);
    listeners.forEach((l) => l.onPoint(point));
  },

  reset(all: StrokeData[] = []): void {
    strokes = all;
    listeners.forEach((l) => l.onReset(strokes));
  },

  subscribe(listener: StrokeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
