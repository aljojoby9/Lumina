import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Search, Music, Play, Pause, Plus, X, Loader2, Volume2,
    Headphones, Disc3, Guitar, Piano, Zap, Coffee, Film, Sparkles
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

interface MusicTrack {
    id: string;
    title: string;
    artist: string;
    duration: number;
    tags: string;
    category: string;
    url: string;
    preview: string;
}

interface MusicBrowserProps {
    isOpen: boolean;
    onClose: () => void;
    onAddTrack: (track: { name: string; url: string; duration: number }) => void;
    currentTime: number;
}

const CATEGORIES = [
    { id: '', label: 'All', icon: Music, color: 'text-white' },
    { id: 'cinematic', label: 'Cinematic', icon: Film, color: 'text-amber-400' },
    { id: 'pop', label: 'Pop', icon: Sparkles, color: 'text-pink-400' },
    { id: 'ambient', label: 'Ambient', icon: Coffee, color: 'text-cyan-400' },
    { id: 'rock', label: 'Rock', icon: Guitar, color: 'text-red-400' },
    { id: 'electronic', label: 'Electronic', icon: Zap, color: 'text-purple-400' },
    { id: 'jazz', label: 'Jazz', icon: Piano, color: 'text-yellow-400' },
    { id: 'acoustic', label: 'Acoustic', icon: Headphones, color: 'text-green-400' },
    { id: 'corporate', label: 'Corporate', icon: Disc3, color: 'text-blue-400' },
];

const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const MusicBrowser: React.FC<MusicBrowserProps> = ({ isOpen, onClose, onAddTrack, currentTime }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [category, setCategory] = useState('');
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
    const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchTracks = useCallback(async (query: string, cat: string) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (cat) params.set('category', cat);

            const res = await fetch(`${BACKEND_URL}/api/music/search?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setTracks(data.tracks || []);
            }
        } catch (err) {
            console.error('Failed to fetch music:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load tracks on open
    useEffect(() => {
        if (isOpen) {
            fetchTracks(searchQuery, category);
        }
    }, [isOpen]);

    // Debounced search
    useEffect(() => {
        if (!isOpen) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            fetchTracks(searchQuery, category);
        }, 300);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [searchQuery, category, isOpen, fetchTracks]);

    // Cleanup audio on close
    useEffect(() => {
        if (!isOpen && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlayingTrackId(null);
        }
    }, [isOpen]);

    const handlePreview = (track: MusicTrack) => {
        if (playingTrackId === track.id) {
            // Stop playing
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            setPlayingTrackId(null);
            return;
        }

        // Stop any currently playing
        if (audioRef.current) {
            audioRef.current.pause();
        }

        // Play through the backend proxy to avoid CORS
        const proxyUrl = `${BACKEND_URL}/api/music/download?url=${encodeURIComponent(track.preview)}`;
        const audio = new Audio(proxyUrl);
        audio.volume = 0.5;
        audio.play().catch(err => {
            console.error('Failed to play preview:', err);
            // Try direct URL as fallback
            const directAudio = new Audio(track.preview);
            directAudio.volume = 0.5;
            directAudio.play().catch(() => { });
            audioRef.current = directAudio;
        });
        audio.onended = () => {
            setPlayingTrackId(null);
        };
        audioRef.current = audio;
        setPlayingTrackId(track.id);
    };

    const handleAddTrack = async (track: MusicTrack) => {
        setAddingTrackId(track.id);

        // Stop preview if playing
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlayingTrackId(null);
        }

        try {
            // Download through proxy to get a blob URL that works in the editor
            const proxyUrl = `${BACKEND_URL}/api/music/download?url=${encodeURIComponent(track.url)}`;
            const res = await fetch(proxyUrl);

            if (!res.ok) throw new Error('Download failed');

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);

            // Get actual audio duration
            const actualDuration = await new Promise<number>((resolve) => {
                const tempAudio = document.createElement('audio');
                tempAudio.preload = 'metadata';
                tempAudio.onloadedmetadata = () => {
                    const dur = tempAudio.duration;
                    resolve(Number.isFinite(dur) && dur > 0 ? dur : track.duration);
                };
                tempAudio.onerror = () => resolve(track.duration);
                tempAudio.src = blobUrl;
            });

            onAddTrack({
                name: `${track.title} — ${track.artist}`,
                url: blobUrl,
                duration: actualDuration,
            });

            onClose();
        } catch (err) {
            console.error('Failed to add track:', err);
        } finally {
            setAddingTrackId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 bg-black/85 z-[80] flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-3xl max-h-[85vh] bg-dark-surface border border-green-500/30 rounded-3xl shadow-[0_0_100px_rgba(34,197,94,0.15)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/20 flex items-center justify-center text-green-300">
                            <Music size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Music Library</h3>
                            <p className="text-xs text-gray-500 uppercase tracking-wider">Royalty-Free • Add to Timeline</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search + Categories */}
                <div className="px-6 pt-4 pb-2 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search music... (e.g. happy, cinematic, chill)"
                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-green-500/50 text-sm placeholder:text-gray-600 transition-all"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border transition-all ${category === cat.id
                                            ? 'bg-green-500/20 border-green-500/50 text-green-300'
                                            : 'bg-black/20 border-white/10 text-gray-400 hover:text-white hover:border-gray-600'
                                        }`}
                                >
                                    <Icon size={12} className={category === cat.id ? cat.color : ''} />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Track List */}
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 size={28} className="animate-spin text-green-400" />
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Loading tracks...</p>
                        </div>
                    ) : tracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Music size={32} className="text-gray-600" />
                            <p className="text-sm text-gray-500">No tracks found. Try a different search.</p>
                        </div>
                    ) : (
                        tracks.map((track) => (
                            <div
                                key={track.id}
                                className={`group flex items-center gap-4 p-3 rounded-xl border transition-all ${playingTrackId === track.id
                                        ? 'bg-green-500/10 border-green-500/30 shadow-[0_0_16px_rgba(34,197,94,0.1)]'
                                        : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
                                    }`}
                            >
                                {/* Play/Pause Button */}
                                <button
                                    onClick={() => handlePreview(track)}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${playingTrackId === track.id
                                            ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                                            : 'bg-gray-800 text-gray-400 hover:bg-green-600 hover:text-white group-hover:bg-gray-700'
                                        }`}
                                >
                                    {playingTrackId === track.id ? <Pause size={16} /> : <Play size={16} />}
                                </button>

                                {/* Track Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{track.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-gray-500 font-medium">{track.artist}</span>
                                        <span className="text-[8px] text-gray-700">•</span>
                                        <span className="text-[10px] text-gray-500 font-mono">{formatDuration(track.duration)}</span>
                                        <span className="text-[8px] text-gray-700">•</span>
                                        <span className="text-[9px] text-green-600/80 bg-green-500/10 px-1.5 py-0.5 rounded font-bold uppercase">{track.category}</span>
                                    </div>
                                    {/* Mini waveform animation when playing */}
                                    {playingTrackId === track.id && (
                                        <div className="flex items-end gap-[2px] h-3 mt-1">
                                            {Array.from({ length: 12 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="w-1 bg-green-400 rounded-full animate-pulse"
                                                    style={{
                                                        height: `${30 + Math.random() * 70}%`,
                                                        animationDelay: `${i * 0.1}s`,
                                                        animationDuration: `${0.4 + Math.random() * 0.3}s`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Add Button */}
                                <button
                                    onClick={() => handleAddTrack(track)}
                                    disabled={addingTrackId === track.id}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-tight transition-all flex-shrink-0 ${addingTrackId === track.id
                                            ? 'bg-green-800 text-green-300 opacity-70'
                                            : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30 hover:scale-105 active:scale-95'
                                        }`}
                                >
                                    {addingTrackId === track.id ? (
                                        <><Loader2 size={14} className="animate-spin" /> Adding...</>
                                    ) : (
                                        <><Plus size={14} /> Add</>
                                    )}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                        {tracks.length} track{tracks.length !== 1 ? 's' : ''} • Free Music Archive • CC Licensed
                    </p>
                    <div className="flex items-center gap-1 text-[9px] text-gray-600">
                        <Volume2 size={10} />
                        Royalty Free
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MusicBrowser;
