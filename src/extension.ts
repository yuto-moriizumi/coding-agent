// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ChatVSCodeLanguageModelAPI } from "./ChatVSCodeLanguageModelAPI";
import { HumanMessage } from "@langchain/core/messages";

const ANNOTATION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "coding-agent" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerTextEditorCommand(
    "code-tutor.annotate",
    async (textEditor: vscode.TextEditor) => {
      const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);
      
      // Using ChatVSCodeLanguageModelAPI with langchain
      const chatModel = new ChatVSCodeLanguageModelAPI({
        vendor: "copilot",
        family: "gpt-4o",
      });

      try {
        const messages = [
          new HumanMessage(ANNOTATION_PROMPT),
          new HumanMessage(codeWithLineNumbers),
        ];

        const result = await chatModel.invoke(messages);
        await parseLangChainResponse(result.content as string, textEditor);
      } catch (error) {
        console.error("Error using ChatVSCodeLanguageModelAPI:", error);
        vscode.window.showErrorMessage(`Failed to get code annotations: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

function applyDecoration(
  editor: vscode.TextEditor,
  line: number,
  suggestion: string
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
    new vscode.Position(line - 1, lineLength)
  );

  const decoration = { range: range, hoverMessage: suggestion };

  vscode.window.activeTextEditor?.setDecorations(decorationType, [decoration]);
}

async function parseLangChainResponse(
  response: string,
  textEditor: vscode.TextEditor
) {
  const lines = response.split('\n');
  
  for (const line of lines) {
    if (line.trim() && line.includes('{') && line.includes('}')) {
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
