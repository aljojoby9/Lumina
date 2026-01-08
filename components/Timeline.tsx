
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TimelineClip, Subtitle, FilterType, TransitionType } from '../types';
import { Type, Scissors, Wand2, Layers, MoveHorizontal } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: TimelineClip[];
  subtitles: Subtitle[];
  onSeek: (time: number) => void;
  onDropPreset: (clipId: string, type: 'filter' | 'transition', value: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, clips, subtitles, onSeek, onDropPreset }) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggedOverClip, setDraggedOverClip] = useState<string | null>(null);

  const timelineDuration = Math.max(duration, 10);

  const calculateTimeFromX = useCallback((clientX: number) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * timelineDuration;
  }, [timelineDuration]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    onSeek(calculateTimeFromX(e.clientX));
  };

  useEffect(() => {
    let lastSeekTime = 0;
    const SEEK_THROTTLE = 50; // ms

    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        const now = performance.now();
        if (now - lastSeekTime > SEEK_THROTTLE) {
          onSeek(calculateTimeFromX(e.clientX));
          lastSeekTime = now;
        }
      }
    };
    const handleMouseUp = () => setIsScrubbing(false);

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, calculateTimeFromX, onSeek]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent, clipId: string) => {
    e.preventDefault();
    setDraggedOverClip(null);
    const data = e.dataTransfer.getData('preset');
    if (data) {
      const { type, value } = JSON.parse(data);
      onDropPreset(clipId, type, value);
    }
  };

  const handleDragEnter = (e: React.DragEvent, clipId: string) => {
    e.preventDefault();
    setDraggedOverClip(clipId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOverClip(null);
  };

  return (
    <div className="w-full h-56 bg-dark-surface border-t border-dark-border flex flex-col select-none relative z-30">
      <div className="h-8 flex items-center justify-between px-6 text-[10px] text-gray-500 border-b border-dark-border bg-gray-900/80 font-mono tracking-tighter">
        <div className="flex items-center gap-4">
          <span className="text-lumina-400 font-bold">{Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(2).padStart(5, '0')}</span>
          <span className="opacity-30">/</span>
          <span>{Math.floor(timelineDuration / 60)}:{(timelineDuration % 60).toFixed(2).padStart(5, '0')}</span>
        </div>
        <div className="flex gap-4">
          <button className="hover:text-white transition-colors flex items-center gap-1"><Scissors size={12} /> Split</button>
        </div>
      </div>

      <div className="flex-1 relative p-4 space-y-3 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div
          className="relative h-full min-w-full"
          ref={progressBarRef}
          onMouseDown={handleMouseDown}
        >
          {/* Time Markers */}
          <div className="absolute inset-0 flex pointer-events-none border-b border-white/5 h-4">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex-1 border-l border-white/10 h-full text-[8px] pl-1 pt-0.5">{(i * timelineDuration / 10).toFixed(0)}s</div>
            ))}
          </div>

          {/* Video Track */}
          <div className="h-16 relative bg-gray-900/50 rounded-lg border border-white/5 mb-3 mt-6 shadow-inner overflow-hidden">
            {clips.map((clip) => (
              <div
                key={clip.id}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, clip.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, clip.id)}
                className={`absolute top-0 bottom-0 bg-lumina-600/20 border-x border-lumina-400/30 group cursor-pointer flex flex-col items-start p-2 gap-1 overflow-hidden transition-all hover:bg-lumina-600/30 
                                ${clip.filter && clip.filter !== 'none' ? 'ring-1 ring-purple-500/50' : ''}
                                ${draggedOverClip === clip.id ? 'ring-2 ring-lumina-400 bg-lumina-400/20 scale-[1.02] z-10 shadow-[0_0_20px_rgba(14,165,233,0.3)]' : ''}
                            `}
                style={{
                  left: `${(clip.start / timelineDuration) * 100}%`,
                  width: `${(clip.duration / timelineDuration) * 100}%`
                }}
              >
                {draggedOverClip === clip.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-lumina-500/10 backdrop-blur-[1px] pointer-events-none">
                    <div className="bg-lumina-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-lg animate-bounce">
                      Apply Effect
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[10px] font-bold text-white/90 truncate flex-1 uppercase tracking-tight">{clip.name}</span>
                  {clip.transitionIn && <MoveHorizontal size={10} className="text-yellow-400" />}
                  {clip.filter && clip.filter !== 'none' && <Wand2 size={10} className="text-purple-400" />}
                </div>
                <div className="flex gap-1 h-2 opacity-50">
                  {Array.from({ length: Math.ceil(clip.duration) }).map((_, i) => (
                    <div key={i} className="w-1 bg-white/20 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Subtitle Track */}
          <div className="h-8 relative bg-purple-900/10 rounded-lg border border-purple-500/10">
            <div className="absolute left-0 -top-4 text-[8px] text-purple-400 font-black uppercase tracking-[0.2em] opacity-60">Speech Track</div>
            {subtitles.map((sub) => (
              <div
                key={sub.id}
                className="absolute top-1 bottom-1 bg-purple-500/20 border border-purple-400/30 rounded flex items-center justify-center px-2 shadow-sm"
                style={{
                  left: `${(sub.start / timelineDuration) * 100}%`,
                  width: `${(sub.duration / timelineDuration) * 100}%`
                }}
              >
                <Type size={10} className="text-purple-300" />
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            style={{ left: `${(currentTime / timelineDuration) * 100}%` }}
          >
            <div className="w-3 h-3 -ml-[5px] -mt-1 bg-red-500 rounded-full border-2 border-white"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
