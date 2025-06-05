import * as vscode from "vscode";
import { Workflow } from "./Workflow";
import { LanguageModelLike } from "@langchain/core/language_models/base";

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
  private _chatModel: LanguageModelLike;
  private _workflow: Workflow;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    _chatModel: LanguageModelLike,
  ) {
    this._chatModel = _chatModel;
    this._workflow = new Workflow(this._chatModel);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
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
      console.log("BEFORE WORKFLOW EXECUTION");
      const result = await this._workflow.execute(message);
      console.log("AFTER WORKFLOW EXECUTION");

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

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview", "styles.css"),
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
        <link href="${styleUri}" rel="stylesheet">
        <title>CodingAgent Chat</title>
    </head>
    <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}
