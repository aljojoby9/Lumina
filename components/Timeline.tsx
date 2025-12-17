import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip } from '../types';
import { ChevronLeft, ChevronRight, GripVertical, AlertTriangle } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: TimelineClip[];
  onSeek: (time: number) => void;
  onClipUpdate: (updatedClip: TimelineClip) => void;
}

const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, clips, onSeek, onClipUpdate }) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragAction, setDragAction] = useState<'move' | 'trim-start' | 'trim-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialClipState, setInitialClipState] = useState<TimelineClip | null>(null);
  
  // Scrubbing State
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Constants
  const MIN_DURATION = 1; // Minimum clip duration in seconds

  const getPixelsPerSecond = () => {
    if (!progressBarRef.current || duration === 0) return 0;
    return progressBarRef.current.clientWidth / Math.max(duration, 10); // Ensure minimal width
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only seek if we aren't dragging a clip
    if (draggingId) return;

    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percentage * Math.max(duration, 10)); // Use max duration for scaling
  };
  
  const handleMouseDownScrub = (e: React.MouseEvent<HTMLDivElement>) => {
      // Start scrubbing
      setIsScrubbing(true);
      // Also seek immediately
      handleTimelineClick(e);
  };

  const handleMouseDownClip = (e: React.MouseEvent, clip: TimelineClip, action: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation(); // Prevent triggering timeline scrub
    setDraggingId(clip.id);
    setDragAction(action);
    setDragStartX(e.clientX);
    setInitialClipState({ ...clip });
  };

  // Effect for Scrubbing (Playhead Drag)
  useEffect(() => {
    const handleWindowMouseMoveScrub = (e: MouseEvent) => {
        if (isScrubbing && progressBarRef.current) {
            const rect = progressBarRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));
            onSeek(percentage * Math.max(duration, 10));
        }
    };
    
    const handleWindowMouseUpScrub = () => {
        setIsScrubbing(false);
    };

    if (isScrubbing) {
        window.addEventListener('mousemove', handleWindowMouseMoveScrub);
        window.addEventListener('mouseup', handleWindowMouseUpScrub);
    }
    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMoveScrub);
        window.removeEventListener('mouseup', handleWindowMouseUpScrub);
    }
  }, [isScrubbing, duration, onSeek]);

  // Effect for Clip Dragging/Trimming
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingId || !dragAction || !initialClipState || !progressBarRef.current) return;

      const pps = getPixelsPerSecond();
      if (pps === 0) return;

      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pps;

      let newClip = { ...initialClipState };
      // Safety defaults
      const initialDuration = initialClipState.duration || 5;
      const initialStart = initialClipState.start || 0;
      const initialOffset = initialClipState.offset || 0;

      if (dragAction === 'move') {
        newClip.start = Math.max(0, initialStart + deltaTime);
      } else if (dragAction === 'trim-start') {
        const maxDelta = initialDuration - MIN_DURATION;
        const actualDelta = Math.min(Math.max(deltaTime, -initialOffset), maxDelta);
        
        newClip.start = initialStart + actualDelta;
        newClip.duration = initialDuration - actualDelta;
        newClip.offset = initialOffset + actualDelta;

      } else if (dragAction === 'trim-end') {
        newClip.duration = Math.max(MIN_DURATION, initialDuration + deltaTime);
      }

      onClipUpdate(newClip);
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      setDragAction(null);
      setInitialClipState(null);
    };

    if (draggingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, dragAction, dragStartX, initialClipState, duration, onClipUpdate]);

  const formatTime = (seconds: number) => {
    const safeSeconds = seconds || 0;
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timelineDuration = Math.max(duration, 10); // Minimum 10s timeline

  return (
    <div className="w-full h-40 bg-dark-surface border-t border-dark-border flex flex-col select-none">
        {/* Time Indicators */}
        <div className="h-6 flex items-center px-4 text-xs text-gray-500 border-b border-dark-border bg-gray-900/50">
            <span className="w-16">{formatTime(currentTime)}</span>
            <div className="flex-1 flex justify-between px-4 opacity-30">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="w-px h-2 bg-gray-500"></div>
                ))}
            </div>
            <span className="w-16 text-right">{formatTime(timelineDuration)}</span>
        </div>

        {/* Tracks Area */}
        <div className="flex-1 relative p-4 overflow-hidden overflow-x-auto">
            <div 
                className="relative h-full min-w-full"
                style={{ width: '100%' }}
                ref={progressBarRef}
            >
                {/* Clickable Area Background (Captures Scrub interactions) */}
                <div 
                    className="absolute inset-0 bg-gray-900/50 rounded-lg cursor-crosshair z-0"
                    onMouseDown={handleMouseDownScrub}
                >
                    {/* Background Grid */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                        style={{ backgroundImage: 'linear-gradient(90deg, #555 1px, transparent 1px)', backgroundSize: '5% 100%' }}>
                    </div>
                </div>

                {/* Clips (z-index 10) */}
                {clips.map((clip) => {
                    const safeDuration = clip.duration || 1; // Prevent NaN
                    const safeStart = clip.start || 0;
                    const isMissing = !clip.src;
                    
                    return (
                        <div 
                            key={clip.id}
                            className={`absolute top-2 bottom-6 rounded-md overflow-visible group select-none shadow-md z-10
                                ${isMissing ? 'bg-red-900/40 border-red-500/50' : (clip.type === 'video' ? 'bg-lumina-900/80 border-lumina-500/50' : 'bg-purple-900/80 border-purple-500/50')}
                                border hover:ring-2 hover:ring-white/20 transition-all
                            `}
                            style={{
                                left: `${(safeStart / timelineDuration) * 100}%`,
                                width: `${(safeDuration / timelineDuration) * 100}%`,
                                cursor: 'grab'
                            }}
                            onMouseDown={(e) => handleMouseDownClip(e, clip, 'move')}
                        >
                             {/* Drag Handle Left (Trim Start) */}
                             <div 
                                className="absolute left-0 top-0 bottom-0 w-3 bg-white/10 hover:bg-white/30 cursor-ew-resize flex items-center justify-center z-20 group-hover:opacity-100 opacity-0 transition-opacity"
                                onMouseDown={(e) => handleMouseDownClip(e, clip, 'trim-start')}
                             >
                                <div className="w-1 h-4 bg-white/50 rounded-full"></div>
                             </div>

                             {/* Clip Content */}
                             <div className="w-full h-full flex flex-col justify-center px-4 relative overflow-hidden pointer-events-none">
                                 {/* Thumbnails Strip (Simulated) */}
                                 <div className="absolute inset-0 flex opacity-20">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="flex-1 border-r border-black/20 bg-white/5"></div>
                                    ))}
                                 </div>
                                 
                                 <div className="flex items-center gap-2 relative z-0">
                                    {isMissing && <AlertTriangle size={12} className="text-red-400" />}
                                    <span className={`text-xs font-medium truncate shadow-black drop-shadow-md ${isMissing ? 'text-red-200' : 'text-white'}`}>
                                        {clip.name}
                                    </span>
                                    <span className="text-[10px] text-white/60 bg-black/40 px-1 rounded">
                                        {(clip.duration || 0).toFixed(1)}s
                                    </span>
                                 </div>
                             </div>

                             {/* Drag Handle Right (Trim End) */}
                             <div 
                                className="absolute right-0 top-0 bottom-0 w-3 bg-white/10 hover:bg-white/30 cursor-ew-resize flex items-center justify-center z-20 group-hover:opacity-100 opacity-0 transition-opacity"
                                onMouseDown={(e) => handleMouseDownClip(e, clip, 'trim-end')}
                             >
                                <div className="w-1 h-4 bg-white/50 rounded-full"></div>
                             </div>
                        </div>
                    );
                })}

                {/* Playhead Line (z-index 20) */}
                <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none transition-all duration-75 ease-linear"
                    style={{ left: `${(currentTime / timelineDuration) * 100}%` }}
                >
                    <div className="w-3 h-3 -ml-1.5 bg-red-500 transform rotate-45 -translate-y-1.5 mt-0 shadow-sm"></div>
                    <div className="absolute top-0 bottom-0 w-full bg-gradient-to-b from-red-500/50 to-transparent"></div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Timeline;