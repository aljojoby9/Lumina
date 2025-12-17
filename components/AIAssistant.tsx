import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Loader2, Aperture } from 'lucide-react';
import { ChatMessage } from '../types';

interface AIAssistantProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ messages, onSendMessage, isProcessing }) => {
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

  const handleAnalyzeFrame = () => {
    if (!isProcessing) {
      onSendMessage("Analyze this specific video frame and describe what is happening visually.");
    }
  };

  const suggestions = [
    "Make it cinematic",
    "Slow down the video",
    "Increase volume",
    "Analyze the mood"
  ];

  return (
    <div className="flex flex-col h-full bg-dark-surface border-r border-dark-border w-80">
      <div className="p-4 border-b border-dark-border flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lumina-500 to-purple-500 flex items-center justify-center">
            <Bot size={18} className="text-white" />
        </div>
        <div>
            <h2 className="font-semibold text-white leading-tight">Lumina AI</h2>
            <p className="text-xs text-lumina-400">Editor Assistant</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 && (
           <div className="text-center mt-10 opacity-50">
             <Sparkles className="mx-auto mb-2 text-lumina-500" size={32} />
             <p className="text-sm">Ask me to edit your video or analyze the content!</p>
           </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-lumina-600 text-white rounded-br-none'
                  : 'bg-gray-800 text-gray-200 rounded-bl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-lumina-400" />
                <span className="text-xs text-gray-400">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Suggestions */}
      {messages.length < 3 && !isProcessing && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
              {suggestions.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => onSendMessage(s)}
                    className="whitespace-nowrap px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-lumina-300 rounded-full border border-gray-700 transition-colors"
                  >
                      {s}
                  </button>
              ))}
          </div>
      )}

      <div className="p-4 border-t border-dark-border">
        <div className="flex gap-2 items-end">
            <button
                type="button"
                onClick={handleAnalyzeFrame}
                disabled={isProcessing}
                className="group relative p-3 bg-gray-800 hover:bg-gray-700 text-lumina-400 hover:text-white rounded-lg border border-gray-700 transition-all disabled:opacity-50"
                title="Snap & Analyze Current Frame"
            >
                <div className="absolute inset-0 bg-lumina-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Aperture size={20} className="group-hover:rotate-45 transition-transform duration-500" />
            </button>

            <form onSubmit={handleSubmit} className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type an instruction..."
                disabled={isProcessing}
                className="w-full bg-black border border-gray-700 text-white rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:border-lumina-500 text-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isProcessing}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-lumina-500 hover:text-lumina-300 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;