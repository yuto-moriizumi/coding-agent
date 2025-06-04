import * as React from "react";
import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
    };
  }
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [vscodeApi] = useState(() => window.acquireVsCodeApi());
  console.log("render ChatApp");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "updateChat") {
        setMessages(message.messages);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    const message = inputValue.trim();
    if (message) {
      vscodeApi.postMessage({
        type: "sendMessage",
        message: message,
      });
      setInputValue("");
    }
  };

  const clearChat = () => {
    vscodeApi.postMessage({
      type: "clearChat",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <div className="chat-app">
      <div className="header">
        <h3>CodingAgent Chat</h3>
        <button id="clearButton" onClick={clearChat}>
          Clear
        </button>
      </div>

      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div className="message assistant">
            <div className="message-header">Assistant</div>
            <div className="message-content">
              Hello! I'm CodingAgent, your AI coding assistant. How can I help
              you today?
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-header">
                {msg.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))
        )}
      </div>

      <div className="input-container">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
