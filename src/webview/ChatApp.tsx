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

interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface SettingsData {
  adapter: "ChatVSCodeLanguageModelAPI" | "ChatOpenAI";
  openAIModel: string;
  openAIApiKey?: string;
  availableModels?: OpenAIModel[];
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    adapter: "ChatVSCodeLanguageModelAPI",
    openAIModel: "gpt-4o",
    openAIApiKey: "",
    availableModels: []
  });
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [vscodeApi] = useState(() => window.acquireVsCodeApi());
  console.log("render ChatApp");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "updateChat") {
        setMessages(message.messages);
      } else if (message.type === "updateSettings") {
        setSettings(message.settings);
      }
    };

    window.addEventListener("message", handleMessage);
    
    // Request initial chat history and settings after component mounts
    vscodeApi.postMessage({
      type: "requestHistory"
    });
    vscodeApi.postMessage({
      type: "requestSettings"
    });
    
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

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    vscodeApi.postMessage({
      type: "updateSettings",
      settings: newSettings
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  const SettingsPanel = () => (
    <div className="settings-panel">
      <div className="settings-header">
        <h4>Settings</h4>
        <button onClick={toggleSettings}>✕</button>
      </div>
      <div className="settings-content">
        <div className="setting-item">
          <label htmlFor="adapter-select">Language Model Adapter:</label>
          <select
            id="adapter-select"
            value={settings.adapter}
            onChange={(e) => handleSettingsChange({
              ...settings,
              adapter: e.target.value as "ChatVSCodeLanguageModelAPI" | "ChatOpenAI"
            })}
          >
            <option value="ChatVSCodeLanguageModelAPI">VSCode Language Model API</option>
            <option value="ChatOpenAI">OpenAI API</option>
          </select>
        </div>
        
        {settings.adapter === "ChatOpenAI" && (
          <>
            <div className="setting-item">
              <label htmlFor="openai-api-key">OpenAI API Key:</label>
              <input
                type="password"
                id="openai-api-key"
                value={settings.openAIApiKey || ""}
                onChange={(e) => handleSettingsChange({
                  ...settings,
                  openAIApiKey: e.target.value
                })}
                placeholder="Enter your OpenAI API key"
              />
            </div>
            <div className="setting-item">
              <label htmlFor="openai-model-select">OpenAI Model:</label>
              <select
                id="openai-model-select"
                value={settings.openAIModel}
                onChange={(e) => handleSettingsChange({
                  ...settings,
                  openAIModel: e.target.value
                })}
              >
                {settings.availableModels?.map((model) => (
                  <option key={model.id} value={model.id} title={model.description}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="chat-app">
      <div className="header">
        <h3>CodingAgent Chat</h3>
        <div className="header-buttons">
          <button id="clearButton" onClick={clearChat}>
            Clear
          </button>
          <button id="settingsButton" onClick={toggleSettings} title="Settings">
            ⚙️
          </button>
        </div>
      </div>

      {showSettings && <SettingsPanel />}

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
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
