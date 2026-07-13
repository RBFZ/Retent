import React, { useState, useRef, useEffect } from "react";
import type { Message } from "@shared/types";

interface ChatPanelProps {
  messages: Message[];
  onSend: (question: string) => void;
  isLoading: boolean;
}

export function ChatPanel({
  messages,
  onSend,
  isLoading,
}: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className="chat-panel">
      <div className="messages-list">
        {messages.length === 0 && (
          <div className="empty-state">
            Ask me anything about the app you're using.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="message message-assistant">
            <div className="message-content loading-dots">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="chat-input"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
