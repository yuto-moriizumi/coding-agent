// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as dotenv from "dotenv"; // dotenv をインポート
import * as path from "path"; // path モジュールをインポート
import { ChatVSCodeLanguageModelAPI } from "./core/ChatVSCodeLanguageModelAPI";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai"; // ChatOpenAI をインポート
import { ChatViewProvider } from "./core/ChatViewProvider";
import { DIFF_VIEW_URI_SCHEME } from "./core/tools/writeFileTool"; // DIFF_VIEW_URI_SCHEME をインポート

const ANNOTATION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // .env ファイルのパスを解決して読み込む
  // 拡張機能のルートは context.extensionPath
  // ビルド後のJSは dist/extension.js にあるので、.env も dist にあると仮定
  const envPath = path.join(context.extensionPath, ".env"); // ルートの .env を参照する場合
  // もし dist/.env を参照する場合は path.join(context.extensionPath, 'dist', '.env')
  // ユーザーの指示は「distフォルダ内の.env」なので、そちらに合わせる
  const distEnvPath = path.join(context.extensionPath, "dist", ".env");
  const result = dotenv.config({ path: distEnvPath });

  if (result.error) {
    throw result.error; // エラーがあれば例外を投げる
  } else {
    console.log(`.env file loaded from: ${distEnvPath}`);
  }

  console.log('Congratulations, your extension "coding-agent" is now active!');

  // const chatModel = new ChatVSCodeLanguageModelAPI({
  //   vendor: "copilot",
  //   family: "gpt-4.1",
  // });
  // ChatOpenAI を使用した仮実装
  const chatModel = new ChatOpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  }); // 必要に応じてモデル名や設定を調整

  // Register CodingAgent Chat Provider
  const codingAgentChatProvider = new ChatViewProvider(
    context.extensionUri,
    chatModel,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      codingAgentChatProvider,
    ),
  );

  // Register commands
  const openChatCommand = vscode.commands.registerCommand(
    "codingAgent.openChat",
    () => {
      vscode.commands.executeCommand("workbench.view.extension.codingAgent");
    },
  );

  const annotateCommand = vscode.commands.registerTextEditorCommand(
    "code-tutor.annotate",
    async (textEditor: vscode.TextEditor) => {
      const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

      try {
        const messages = [
          new HumanMessage(ANNOTATION_PROMPT),
          new HumanMessage(codeWithLineNumbers),
        ];

        const result = await chatModel.invoke(messages);
        await parseLangChainResponse(result.content as string, textEditor);
      } catch (error) {
        console.error("Error using ChatVSCodeLanguageModelAPI:", error);
        vscode.window.showErrorMessage(
          `Failed to get code annotations: ${error}`,
        );
      }
    },
  );

  context.subscriptions.push(openChatCommand, annotateCommand);

  // TextDocumentContentProvider を登録
  const diffContentProvider = new (class
    implements vscode.TextDocumentContentProvider
  {
    provideTextDocumentContent(uri: vscode.Uri): string {
      console.log(
        `[DEBUG] diffContentProvider: URI query length: ${uri.query.length}`,
      );
      const decodedContent = Buffer.from(uri.query, "base64").toString("utf8");
      console.log(
        `[DEBUG] diffContentProvider: decodedContent length: ${decodedContent.length}`,
      );
      // URIのクエリパラメータからBase64エンコードされたコンテンツを取得し、デコードして返す
      return decodedContent;
    }
  })();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_VIEW_URI_SCHEME,
      diffContentProvider,
    ),
  );
}

function applyDecoration(
  editor: vscode.TextEditor,
  line: number,
  suggestion: string,
) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${suggestion.substring(0, 25) + "..."}`,
      color: "grey",
    },
  });

  // get the end of the line with the specified line number
  const lineLength = editor.document.lineAt(line - 1).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength),
  );

  const decoration = { range: range, hoverMessage: suggestion };

  vscode.window.activeTextEditor?.setDecorations(decorationType, [decoration]);
}

async function parseLangChainResponse(
  response: string,
  textEditor: vscode.TextEditor,
) {
  const lines = response.split("\n");

  for (const line of lines) {
    if (line.trim() && line.includes("{") && line.includes("}")) {
      try {
        const annotation = JSON.parse(line.trim());
        if (annotation.line && annotation.suggestion) {
          applyDecoration(textEditor, annotation.line, annotation.suggestion);
        }
      } catch (e) {
        // Continue processing other lines if one fails to parse
      }
    }
  }
}

function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {
  // get the position of the first and last visible lines
  let currentLine = textEditor.visibleRanges[0].start.line;
  const endLine = textEditor.visibleRanges[0].end.line;

  let code = "";

  // get the text from the line at the current position.
  // The line number is 0-based, so we add 1 to it to make it 1-based.
  while (currentLine < endLine) {
    code += `${currentLine + 1}: ${
      textEditor.document.lineAt(currentLine).text
    } \n`;
    // move to the next line position
    currentLine++;
  }
  return code;
}

// This method is called when your extension is deactivated
export function deactivate() {}
