
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Loader2, Aperture, LayoutTemplate, PlayCircle } from 'lucide-react';
import { ChatMessage } from '../types';

interface AIAssistantProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  onPreview?: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ messages, onSendMessage, isProcessing, onPreview }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleAutoDraft = () => {
    if (!isProcessing) {
      onSendMessage("Generate a human-quality first edit draft for this raw footage.");
    }
  };

  const suggestions = [
    "Generate first draft",
    "Extract best moments",
    "Make it cinematic",
    "Trim long pauses",
    "Add cool transitions"
  ];

  return (
    <div className="flex flex-col h-full bg-dark-surface border-r border-dark-border w-80 shadow-2xl relative z-20">
      <div className="p-4 border-b border-dark-border flex items-center gap-3 bg-gray-900/20">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-lumina-500 to-purple-600 flex items-center justify-center shadow-lg shadow-lumina-900/20">
          <Bot size={22} className="text-white" />
        </div>
        <div>
          <h2 className="font-bold text-white text-sm">Lumina AI</h2>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">
              {isProcessing ? 'Drafting Edits' : 'Online'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center mt-12 px-6">
            <div className="w-16 h-16 bg-lumina-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-lumina-500/20">
              <Sparkles className="text-lumina-500" size={32} />
            </div>
            <p className="text-sm text-gray-300 font-medium">Ready to edit?</p>
            <p className="text-xs text-gray-500 mt-2">Ask me to generate a draft or refine your clips using natural language.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLastModelMessage = idx === messages.length - 1 && msg.role === 'model';
          const isDraftMessage = msg.text.toLowerCase().includes('draft') || msg.text.toLowerCase().includes('edit');

          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user'
                    ? 'bg-lumina-600 text-white rounded-br-none font-medium'
                    : 'bg-gray-800 text-gray-200 border border-white/5 rounded-bl-none'
                  }`}
              >
                {msg.text}

                {isLastModelMessage && isDraftMessage && onPreview && !isProcessing && (
                  <button
                    onClick={onPreview}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-lumina-500/20 hover:bg-lumina-500/30 text-lumina-400 border border-lumina-500/30 rounded-lg text-xs font-bold transition-all w-full justify-center"
                  >
                    <PlayCircle size={14} />
                    Review Draft Now
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-lumina-500/20 rounded-2xl rounded-bl-none px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-lumina-400" />
                <span className="text-xs font-bold text-lumina-400 uppercase tracking-tighter">Drafting your edit...</span>
              </div>
              <div className="w-48 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-lumina-500 animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {!isProcessing && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar mask-fade-right">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSendMessage(s)}
              className="whitespace-nowrap px-3 py-1.5 bg-gray-800 hover:bg-lumina-900/30 hover:text-lumina-400 text-[10px] font-bold text-gray-400 rounded-full border border-gray-700 hover:border-lumina-500/50 transition-all uppercase tracking-tight"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 bg-gray-900/40 border-t border-dark-border">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={handleAutoDraft}
            disabled={isProcessing}
            className="p-2.5 bg-gradient-to-br from-lumina-600 to-purple-600 hover:scale-105 text-white rounded-lg transition-all disabled:opacity-50 shadow-lg"
            title="Generate First Draft"
          >
            <LayoutTemplate size={20} />
          </button>

          <form onSubmit={handleSubmit} className="relative flex-1 group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type an instruction..."
              disabled={isProcessing}
              className="w-full bg-black border border-gray-700 text-white rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:border-lumina-500 text-sm disabled:opacity-50 transition-all placeholder:text-gray-600"
            />
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-lumina-500 hover:text-lumina-300 disabled:opacity-50 transition-all group-focus-within:scale-110"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
      <style>{`
        @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
        }
        .mask-fade-right {
            mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

export default AIAssistant;
