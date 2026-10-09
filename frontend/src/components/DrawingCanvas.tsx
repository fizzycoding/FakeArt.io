import React, { useEffect, useRef } from 'react';
import { StrokeData } from '../types/game';
import { strokeStore } from '../utils/strokeStore';

interface DrawingCanvasProps {
  isMyTurn: boolean;
  color: string;
  brushWidth: number;
  onSendStroke: (stroke: StrokeData) => void;
  onEndStroke: () => void;
}

const SIZE = 600;
const STROKES_PER_TURN = 2; // must match the server
// Points closer together than this (in canvas pixels) add nothing visible, so they
// aren't drawn or sent. It keeps lines smooth and the network quiet.
const MIN_STEP = 1.5;

interface Pen {
  active: boolean;
  x: number;
  y: number;
}

/** Paints one point, joined to the previous one with a single short segment. */
function paintPoint(ctx: CanvasRenderingContext2D, pen: Pen, p: StrokeData): void {
  const px = p.x * SIZE;
  const py = p.y * SIZE;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.width;

  ctx.beginPath();
  if (p.isNewStroke || !pen.active) {
    // The start of a stroke: a tiny segment so a plain tap still leaves a dot.
    ctx.moveTo(px, py);
    ctx.lineTo(px + 0.01, py);
    pen.active = true;
  } else {
    ctx.moveTo(pen.x, pen.y);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  pen.x = px;
  pen.y = py;
}

function blank(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
}

export default function DrawingCanvas({ isMyTurn, color, brushWidth, onSendStroke, onEndStroke }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Everything below is read from event handlers, so it lives in refs rather than state.
  const myTurn = useRef(isMyTurn);
  const drawing = useRef(false);
  const strokesUsed = useRef(0);
  const lastSent = useRef<{ x: number; y: number } | null>(null); // canvas pixels
  const lastMove = useRef<{ x: number; y: number } | null>(null);
  const localPen = useRef<Pen>({ active: false, x: 0, y: 0 });
  const remotePen = useRef<Pen>({ active: false, x: 0, y: 0 });

  // A new turn starts with a fresh set of strokes; losing the turn drops any stroke in progress.
  useEffect(() => {
    myTurn.current = isMyTurn;
    if (isMyTurn) strokesUsed.current = 0;
    else drawing.current = false;
  }, [isMyTurn]);

  // Set the canvas up once, show what has been drawn so far, then paint new points as they arrive.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const redrawAll = (all: StrokeData[]) => {
      blank(ctx);
      const pen: Pen = { active: false, x: 0, y: 0 };
      for (const p of all) paintPoint(ctx, pen, p);
      remotePen.current = { active: false, x: 0, y: 0 };
    };
    redrawAll(strokeStore.all());

    return strokeStore.subscribe({
      onPoint: (p) => {
        // While you're the one drawing, your own line is already on the canvas (it was
        // painted the instant you moved), so the server's copy of it is skipped.
        if (myTurn.current) return;
        paintPoint(ctx, remotePen.current, p);
      },
      onReset: redrawAll,
    });
  }, []);

  // Where a pointer event landed, in canvas pixels.
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(SIZE, ((e.clientX - rect.left) / rect.width) * SIZE)),
      y: Math.max(0, Math.min(SIZE, ((e.clientY - rect.top) / rect.height) * SIZE)),
    };
  };

  // Paints locally right away AND tells the server, so your line never waits on the network.
  const drawPoint = (ctx: CanvasRenderingContext2D, at: { x: number; y: number }, isNewStroke: boolean) => {
    const point: StrokeData = { x: at.x / SIZE, y: at.y / SIZE, color, width: brushWidth, isNewStroke };
    paintPoint(ctx, localPen.current, point);
    onSendStroke(point);
    lastSent.current = at;
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!myTurn.current || drawing.current || strokesUsed.current >= STROKES_PER_TURN) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves if the finger slides off the canvas
    } catch {
      // not every browser allows it; drawing still works
    }
    drawing.current = true;
    strokesUsed.current += 1;
    const at = toCanvas(e);
    lastMove.current = at;
    drawPoint(ctx, at, true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !myTurn.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;

    const at = toCanvas(e);
    lastMove.current = at;
    const from = lastSent.current;
    if (from && Math.hypot(at.x - from.x, at.y - from.y) < MIN_STEP) return;
    drawPoint(ctx, at, false);
  };

  // Each player gets two strokes per turn; lifting the pen ends a stroke.
  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;

    // Make sure the very end of the line wasn't skipped by the spacing rule.
    const end = lastMove.current;
    const from = lastSent.current;
    const ctx = e.currentTarget.getContext('2d');
    if (ctx && end && from && (end.x !== from.x || end.y !== from.y)) drawPoint(ctx, end, false);

    onEndStroke();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block touch-none ${isMyTurn ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={stopDrawing}
      onPointerCancel={stopDrawing}
    />
  );
}
