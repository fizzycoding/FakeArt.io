import React, { useRef, useEffect, useState } from 'react';
import { StrokeData } from '../types/game';

interface DrawingCanvasProps {
  isMyTurn: boolean;
  onSendStroke: (stroke: StrokeData) => void;
  onEndStroke: () => void;
  remoteStrokes: StrokeData[];
  clearSignal: number;
}

const COLORS = [
  '#000000', '#EF4444', '#3B82F6', '#10B981', 
  '#F59E0B', '#8B5CF6', '#EC4899', '#FFFFFF'
];

export default function DrawingCanvas({ 
  isMyTurn, 
  onSendStroke, 
  onEndStroke,
  remoteStrokes,
  clearSignal 
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(6);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 600;
    canvas.height = 600;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 600, 600);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    redrawAll();
  }, [remoteStrokes, clearSignal]);

  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 600, 600);

    let isDrawingStroke = false;

    remoteStrokes.forEach((stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;

      const px = stroke.x * 600;
      const py = stroke.y * 600;

      if (stroke.isNewStroke || !isDrawingStroke) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        isDrawingStroke = true;
      } else {
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    });
  };

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    const nativeEvent = e.nativeEvent;
    if ('touches' in nativeEvent && nativeEvent.touches.length > 0) {
      clientX = nativeEvent.touches[0].clientX;
      clientY = nativeEvent.touches[0].clientY;
    } else if ('clientX' in nativeEvent) {
      clientX = (nativeEvent as MouseEvent).clientX;
      clientY = (nativeEvent as MouseEvent).clientY;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn) return;
    e.preventDefault();
    isDrawing.current = true;
    const { x, y } = getCanvasCoords(e);
    
    onSendStroke({
      x,
      y,
      color: currentColor,
      width: brushWidth,
      isNewStroke: true
    });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !isMyTurn) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);

    onSendStroke({
      x,
      y,
      color: currentColor,
      width: brushWidth,
      isNewStroke: false
    });
  };

  // Each player gets exactly one stroke per turn: lifting the pen ends the turn.
  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    onEndStroke();
  };

  return (
    <div className="flex flex-col gap-3 items-center w-full">
      <div className="canvas-wrapper-1to1">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* Tailwind Canvas Toolbar */}
      <div className={`card !rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 w-full max-w-[520px] transition-all ${
        isMyTurn ? 'opacity-100 pointer-events-auto' : 'opacity-50 pointer-events-none'
      }`}>
        {/* Colors */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setCurrentColor(c)}
              aria-label={`Colour ${c}`}
              style={{ backgroundColor: c }}
              className={`w-7 h-7 rounded-full border-2 border-ink transition-transform cursor-pointer ${
                currentColor === c ? 'scale-125 ring-4 ring-grape/40' : 'hover:scale-110'
              }`}
            />
          ))}
        </div>

        {/* Brush Size */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="2"
            max="24"
            value={brushWidth}
            onChange={(e) => setBrushWidth(Number(e.target.value))}
            className="w-20 accent-grape cursor-pointer"
          />
          <span className="text-xs font-bold text-ink-soft min-w-[28px]">
            {brushWidth}px
          </span>
        </div>

        <span className="chip bg-sun/40 text-ink !text-[11px] !px-2 !py-1">One stroke!</span>
      </div>
    </div>
  );
}
