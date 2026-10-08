import React, { useState } from 'react';
import { Send, Lock, MessageSquare } from 'lucide-react';
import { ChatMessage, GamePhase } from '../types/game';

interface ChatPanelProps {
  currentPhase: GamePhase;
  chatMessages: ChatMessage[];
  onSendMessage: (message: string) => void;
}

export default function ChatPanel({ currentPhase, chatMessages, onSendMessage }: ChatPanelProps) {
  const [text, setText] = useState('');
  const isVoting = currentPhase === 'VOTING';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !isVoting) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <div className="card p-4 flex flex-col h-full min-h-[280px] max-h-[420px] gap-3">
      <div className="flex items-center gap-2 font-display font-semibold text-lg border-b-2 border-ink/10 pb-2">
        <MessageSquare size={20} className="text-grape" />
        <span>Match Chat</span>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {!isVoting ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-soft text-center gap-2 p-4">
            <Lock size={26} className="text-sun" />
            <span className="text-sm font-semibold leading-relaxed">
              Chat unlocks during voting, so nobody leaks the secret word.
            </span>
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="text-sm text-ink-soft font-semibold text-center mt-6">
            No messages yet. Who do you think the Impostor is?
          </div>
        ) : (
          chatMessages.map((msg, idx) => (
            <div key={idx} className="bg-grape-soft/70 rounded-xl p-2.5 text-sm">
              <div className="flex justify-between mb-0.5">
                <span className="font-bold text-grape-dark">{msg.senderName}</span>
                <span className="text-[10px] font-semibold text-ink-soft">{msg.timestamp}</span>
              </div>
              <div className="break-words font-medium">{msg.message}</div>
            </div>
          ))
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isVoting ? 'Say something…' : 'Chat locked'}
          disabled={!isVoting}
          className="input !py-2 !text-sm"
        />
        <button
          type="submit"
          disabled={!isVoting || !text.trim()}
          className="btn btn-primary btn-sm px-3.5"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
