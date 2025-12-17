import React from 'react';
import { VideoState, FilterType } from '../types';
import { Sliders, Volume2, Gauge, Sun, Contrast, Droplet, MoveHorizontal, Wand2 } from 'lucide-react';

interface ControlPanelProps {
  state: VideoState;
  onUpdate: (updates: Partial<VideoState>, commit?: boolean) => void;
  onCommit: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ state, onUpdate, onCommit }) => {
  
  const filters: { id: FilterType; name: string }[] = [
    { id: 'none', name: 'Normal' },
    { id: 'grayscale', name: 'B&W' },
    { id: 'sepia', name: 'Sepia' },
    { id: 'vintage', name: 'Vintage' },
    { id: 'cyberpunk', name: 'Cyber' },
    { id: 'warm', name: 'Warm' },
  ];
  
  const isCustomFilter = !filters.some(f => f.id === state.filter);

  return (
    <div className="w-80 bg-dark-surface border-l border-dark-border p-4 overflow-y-auto flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sliders size={20} className="text-lumina-500" />
            Properties
        </h2>

        {/* Speed Control */}
        <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
                <span className="flex items-center gap-2"><Gauge size={14} /> Speed</span>
                <span>{state.playbackRate}x</span>
            </div>
            <input 
                type="range" 
                min="0.25" 
                max="3" 
                step="0.25"
                value={state.playbackRate}
                onChange={(e) => onUpdate({ playbackRate: parseFloat(e.target.value) })}
                onMouseUp={onCommit}
                onTouchEnd={onCommit}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-lumina-500"
            />
        </div>

        {/* Volume Control */}
        <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
                <span className="flex items-center gap-2"><Volume2 size={14} /> Volume</span>
                <span>{Math.round(state.volume * 100)}%</span>
            </div>
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1"
                value={state.volume}
                onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
                onMouseUp={onCommit}
                onTouchEnd={onCommit}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-lumina-500"
            />
        </div>

        <hr className="border-dark-border" />
        
        {/* Transitions */}
        <div className="space-y-4">
             <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
                 <MoveHorizontal size={14} /> Transitions (sec)
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <label className="text-xs text-gray-500">Fade In</label>
                    <input 
                        type="number" min="0" max="10" step="0.5"
                        value={state.fadeIn || 0}
                        onChange={(e) => onUpdate({ fadeIn: parseFloat(e.target.value) }, true)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-lumina-500 outline-none"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs text-gray-500">Fade Out</label>
                    <input 
                        type="number" min="0" max="10" step="0.5"
                        value={state.fadeOut || 0}
                        onChange={(e) => onUpdate({ fadeOut: parseFloat(e.target.value) }, true)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-lumina-500 outline-none"
                    />
                 </div>
             </div>
        </div>

        <hr className="border-dark-border" />

        {/* Visual Adjustments */}
        <div className="space-y-4">
             <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-2"><Sun size={14} /> Brightness</span>
                    <span>{state.brightness}%</span>
                </div>
                <input 
                    type="range" min="0" max="200"
                    value={state.brightness}
                    onChange={(e) => onUpdate({ brightness: parseInt(e.target.value) })}
                    onMouseUp={onCommit}
                    onTouchEnd={onCommit}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-lumina-500"
                />
            </div>
             <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-2"><Contrast size={14} /> Contrast</span>
                    <span>{state.contrast}%</span>
                </div>
                <input 
                    type="range" min="0" max="200"
                    value={state.contrast}
                    onChange={(e) => onUpdate({ contrast: parseInt(e.target.value) })}
                    onMouseUp={onCommit}
                    onTouchEnd={onCommit}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-lumina-500"
                />
            </div>
             <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-2"><Droplet size={14} /> Saturation</span>
                    <span>{state.saturation}%</span>
                </div>
                <input 
                    type="range" min="0" max="200"
                    value={state.saturation}
                    onChange={(e) => onUpdate({ saturation: parseInt(e.target.value) })}
                    onMouseUp={onCommit}
                    onTouchEnd={onCommit}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-lumina-500"
                />
            </div>
        </div>

        <hr className="border-dark-border" />

        {/* Filters Grid */}
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Filters</span>
                {isCustomFilter && (
                    <span className="text-[10px] bg-purple-900/50 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                        <Wand2 size={10} /> AI Custom
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {filters.map((f) => (
                    <button
                        key={f.id}
                        onClick={() => onUpdate({ filter: f.id }, true)}
                        className={`px-3 py-2 text-xs rounded border transition-colors ${
                            state.filter === f.id 
                            ? 'bg-lumina-900 border-lumina-500 text-white' 
                            : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                    >
                        {f.name}
                    </button>
                ))}
            </div>
        </div>
    </div>
  );
};

export default ControlPanel;