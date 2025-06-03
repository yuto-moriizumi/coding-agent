import * as vscode from "vscode";
import { ChatVSCodeLanguageModelAPI } from "./ChatVSCodeLanguageModelAPI";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { Workflow } from "./Workflow";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codingAgentChat";
  private _view?: vscode.WebviewView;
  private _chatHistory: ChatMessage[] = [];
  private _chatModel: ChatVSCodeLanguageModelAPI;
  private _workflow: Workflow;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._chatModel = new ChatVSCodeLanguageModelAPI({
      vendor: "copilot",
      family: "gpt-4.1",
    });
    this._workflow = new Workflow(this._chatModel);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "sendMessage":
          await this._handleUserMessage(data.message);
          break;
        case "clearChat":
          this._clearChat();
          break;
      }
    });
  }

  private async _handleUserMessage(message: string) {
    if (!this._view) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    };

    this._chatHistory.push(userMessage);
    this._updateWebview();

    // Show working indicator
    const workingMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "🤖 Analyzing your request and creating TODO workflow...",
      timestamp: Date.now(),
    };

    this._chatHistory.push(workingMessage);
    this._updateWebview();

    try {
      // Use langgraph workflow for complex requests
      if (this._isComplexRequest(message)) {
        const result = await this._workflow.execute(message);

        // Replace working message with final result
        this._chatHistory.pop(); // Remove working message

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content:
            (result.messages[result.messages.length - 1]?.content as string) ||
            "Task completed!",
          timestamp: Date.now(),
        };

        this._chatHistory.push(assistantMessage);
      } else {
        // Simple chat for basic questions
        const messages = this._chatHistory
          .filter((msg) => msg.id !== workingMessage.id)
          .map((msg) =>
            msg.role === "user"
              ? new HumanMessage(msg.content)
              : new AIMessage(msg.content)
          );

        const result = await this._chatModel.invoke(messages);

        // Replace working message with response
        this._chatHistory.pop(); // Remove working message

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: result.content as string,
          timestamp: Date.now(),
        };

        this._chatHistory.push(assistantMessage);
      }

      this._updateWebview();
    } catch (error) {
      console.error("Chat error:", error);

      // Replace working message with error
      this._chatHistory.pop(); // Remove working message

      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: "assistant",
        content: `❌ Sorry, I encountered an error: ${error}`,
        timestamp: Date.now(),
      };

      this._chatHistory.push(errorMessage);
      this._updateWebview();

      vscode.window.showErrorMessage(`Chat error: ${error}`);
    }
  }

  private _isComplexRequest(message: string): boolean {
    const complexKeywords = [
      "create",
      "build",
      "implement",
      "add",
      "write",
      "generate",
      "modify",
      "update",
      "fix",
      "refactor",
      "install",
      "setup",
      "file",
      "component",
      "function",
      "class",
      "test",
      "debug",
    ];

    const lowerMessage = message.toLowerCase();
    return complexKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  private _clearChat() {
    this._chatHistory = [];
    this._updateWebview();
  }

  private _updateWebview() {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: "updateChat",
      messages: this._chatHistory,
    });
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CodingAgent Chat</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                margin: 0;
                padding: 10px;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }
            
            .chat-container {
                flex: 1;
                overflow-y: auto;
                margin-bottom: 10px;
                padding: 10px;
                border: 1px solid var(--vscode-widget-border);
                border-radius: 4px;
            }
            
            .message {
                margin-bottom: 15px;
                padding: 8px;
                border-radius: 6px;
            }
            
            .message.user {
                background-color: var(--vscode-inputOption-activeBackground);
                margin-left: 20px;
            }
            
            .message.assistant {
                background-color: var(--vscode-editor-selectionBackground);
                margin-right: 20px;
            }
            
            .message-header {
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 0.9em;
                opacity: 0.8;
            }
            
            .message-content {
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .input-container {
                display: flex;
                gap: 5px;
            }
            
            #messageInput {
                flex: 1;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                outline: none;
            }
            
            #messageInput:focus {
                border-color: var(--vscode-inputOption-activeBorder);
            }
            
            button {
                padding: 8px 12px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--vscode-widget-border);
            }
            
            .header h3 {
                margin: 0;
                color: var(--vscode-foreground);
            }
            
            #clearButton {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            
            #clearButton:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h3>CodingAgent Chat</h3>
            <button id="clearButton">Clear</button>
        </div>
        
        <div class="chat-container" id="chatContainer">
            <div class="message assistant">
                <div class="message-header">Assistant</div>
                <div class="message-content">Hello! I'm CodingAgent, your AI coding assistant. How can I help you today?</div>
            </div>
        </div>
        
        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Type your message..." />
            <button id="sendButton">Send</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const clearButton = document.getElementById('clearButton');

            sendButton.addEventListener('click', sendMessage);
            clearButton.addEventListener('click', clearChat);
            
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });

            function sendMessage() {
                const message = messageInput.value.trim();
                if (message) {
                    vscode.postMessage({
                        type: 'sendMessage',
                        message: message
                    });
                    messageInput.value = '';
                }
            }

            function clearChat() {
                vscode.postMessage({
                    type: 'clearChat'
                });
            }

            window.addEventListener('message', event => {
                const message = event.data;
                
                if (message.type === 'updateChat') {
                    updateChatDisplay(message.messages);
                }
            });

            function updateChatDisplay(messages) {
                chatContainer.innerHTML = '';
                
                if (messages.length === 0) {
                    chatContainer.innerHTML = \`
                        <div class="message assistant">
                            <div class="message-header">Assistant</div>
                            <div class="message-content">Hello! I'm CodingAgent, your AI coding assistant. How can I help you today?</div>
                        </div>
                    \`;
                    return;
                }
                
                messages.forEach(msg => {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${msg.role}\`;
                    
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'message-header';
                    headerDiv.textContent = msg.role === 'user' ? 'You' : 'Assistant';
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    contentDiv.textContent = msg.content;
                    
                    messageDiv.appendChild(headerDiv);
                    messageDiv.appendChild(contentDiv);
                    chatContainer.appendChild(messageDiv);
                });
                
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        </script>
    </body>
    </html>`;
  }
}
