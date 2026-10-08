import React, { useRef, useEffect } from 'react';
import { StrokeData } from '../types/game';

interface DrawingCanvasProps {
  isMyTurn: boolean;
  color: string;
  brushWidth: number;
  onSendStroke: (stroke: StrokeData) => void;
  onEndStroke: () => void;
  remoteStrokes: StrokeData[];
  clearSignal: number;
}

const SIZE = 600;

export default function DrawingCanvas({
  isMyTurn,
  color,
  brushWidth,
  onSendStroke,
  onEndStroke,
  remoteStrokes,
  clearSignal,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let inStroke = false;
    remoteStrokes.forEach((stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      const px = stroke.x * SIZE;
      const py = stroke.y * SIZE;

      if (stroke.isNewStroke || !inStroke) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        inStroke = true;
      } else {
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    });
  }, [remoteStrokes, clearSignal]);

  // Normalised (0..1) coordinates, so the stage's CSS scaling doesn't matter.
  const coords = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMyTurn) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    onSendStroke({ ...coords(e), color, width: brushWidth, isNewStroke: true });
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !isMyTurn) return;
    onSendStroke({ ...coords(e), color, width: brushWidth, isNewStroke: false });
  };

  // Each player gets exactly one stroke per turn: lifting the pen ends the turn.
  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
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
