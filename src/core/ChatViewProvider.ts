import * as vscode from "vscode";
import { Workflow } from "./Workflow";
import { LanguageModelLike } from "@langchain/core/language_models/base";
import { ChatVSCodeLanguageModelAPI } from "./ChatVSCodeLanguageModelAPI";
import { ChatOpenAI } from "@langchain/openai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SettingsData {
  adapter: "ChatVSCodeLanguageModelAPI" | "ChatOpenAI";
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codingAgentChat";
  private _view?: vscode.WebviewView;
  private _chatHistory: ChatMessage[] = [];
  private _chatModel: LanguageModelLike;
  private _workflow: Workflow;
  private _extensionContext: vscode.ExtensionContext;
  private _settings: SettingsData;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    _chatModel: LanguageModelLike,
    extensionContext: vscode.ExtensionContext,
  ) {
    this._chatModel = _chatModel;
    this._workflow = new Workflow(this._chatModel);
    this._extensionContext = extensionContext;

    // Restore chat history from global state
    this._chatHistory = this._extensionContext.globalState.get(
      "taskHistory",
      [],
    );

    // Restore settings from global state
    this._settings = this._extensionContext.globalState.get(
      "codingAgentSettings",
      { adapter: "ChatVSCodeLanguageModelAPI" }
    );
  }

  public getSettings(): SettingsData {
    return this._settings;
  }

  public async updateAdapter(adapter: "ChatVSCodeLanguageModelAPI" | "ChatOpenAI") {
    this._settings.adapter = adapter;
    this._extensionContext.globalState.update("codingAgentSettings", this._settings);
    await this._updateChatModel();
    this._updateSettings();
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
        case "requestHistory":
          // Send history when webview is ready
          this._updateWebview();
          break;
        case "requestSettings":
          // Send current settings to webview
          this._updateSettings();
          break;
        case "updateSettings":
          // Update settings and save to global state
          this._settings = data.settings;
          this._extensionContext.globalState.update("codingAgentSettings", this._settings);
          // Update the chat model based on the new settings
          await this._updateChatModel();
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

    // Get active and open tabs
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const activeFilePath =
      activeTab?.input instanceof vscode.TabInputText
        ? activeTab.input.uri.fsPath
        : undefined;

    const openFilePaths: string[] = [];
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          openFilePaths.push(tab.input.uri.fsPath);
        }
      }
    }

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
      const result = await this._workflow.execute(
        message,
        activeFilePath,
        openFilePaths,
      );
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

    // Save chat history to global state
    this._extensionContext.globalState.update("taskHistory", this._chatHistory);
  }

  private _updateSettings() {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: "updateSettings",
      settings: this._settings,
    });
  }

  private async _updateChatModel() {
    // Create a new chat model instance based on the settings
    console.log(`Settings updated: Using ${this._settings.adapter}`);
    
    try {
      if (this._settings.adapter === "ChatVSCodeLanguageModelAPI") {
        this._chatModel = new ChatVSCodeLanguageModelAPI({
          vendor: "copilot",
          family: "gpt-4o",
        });
      } else if (this._settings.adapter === "ChatOpenAI") {
        this._chatModel = new ChatOpenAI({
          modelName: "gpt-4o",
          temperature: 0,
        });
      }
      
      // Update the workflow with the new model
      this._workflow = new Workflow(this._chatModel);
      
      console.log(`Successfully switched to ${this._settings.adapter}`);
      
      // Optionally notify user
      vscode.window.showInformationMessage(`Switched to ${this._settings.adapter === "ChatVSCodeLanguageModelAPI" ? "VSCode Language Model API" : "OpenAI API"}`);
    } catch (error) {
      console.error("Failed to update chat model:", error);
      vscode.window.showErrorMessage(`Failed to switch to ${this._settings.adapter}: ${error}`);
    }
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
