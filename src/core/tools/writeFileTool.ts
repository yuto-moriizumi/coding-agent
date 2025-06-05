import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getWorkspaceRoot } from "../workspace";

export const DIFF_VIEW_URI_SCHEME = "agent-diff";

async function readFileContent(uri: vscode.Uri): Promise<string> {
  try {
    const content = await fs.readFile(uri.fsPath, { encoding: 'utf8' });
    return content;
  } catch (error) {
    return "";
  }
}

async function showDiff(
  originalContent: string,
  modifiedContent: string,
  fileName: string,
  targetUri: vscode.Uri,
  finalContent: string
) {
  const workspaceRoot = getWorkspaceRoot();
  const tmpDir = path.join(workspaceRoot, ".vscode-agent-tmp");
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpDir)).then(
    () => {},
    (err) => {
      if (err.code !== "EEXIST") {
        console.error("Failed to create .vscode-agent-tmp directory:", err);
      }
    }
  );

  console.log(`[DEBUG] showDiff: originalContent length: ${originalContent.length}`);
  console.log(`[DEBUG] showDiff: modifiedContent length: ${modifiedContent.length}`);

  const originalContentBase64 = Buffer.from(originalContent).toString("base64");
  console.log(`[DEBUG] showDiff: originalContentBase64 length: ${originalContentBase64.length}`);

  const originalUri = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
    query: originalContentBase64,
  });
  const modifiedUri = targetUri;

  const fileExists = originalContent !== "";
  const title = `${fileName}: ${fileExists ? "Original ↔ Agent's Changes" : "New File"} (Editable)`;

  try {
    const document = await vscode.workspace.openTextDocument(targetUri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, modifiedContent);
    await vscode.workspace.applyEdit(edit);
    if (document.isDirty) {
      await document.save();
    }
  } catch (error) {
    console.error(`Error updating target file before diff: ${error}`);
    vscode.window.showErrorMessage(`Diff表示前にファイルの更新に失敗しました: ${fileName} - ${error}`);
    return;
  }

  await vscode.commands.executeCommand(
    "vscode.diff",
    originalUri,
    modifiedUri,
    title,
    { preview: true }
  );

  setTimeout(async () => {
    try {
      vscode.window.showInformationMessage(
        `ファイル '${fileName}' を更新しました。`
      );
      await closeAgentDiffViews();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await vscode.window.showTextDocument(targetUri);
    } catch (error) {
      vscode.window.showErrorMessage(
        `ファイルの書き込み中にエラーが発生しました: ${fileName} - ${error}`
      );
    }
  }, 2000);
}

async function closeAgentDiffViews() {
  const tabs = vscode.window.tabGroups.all
    .flatMap((tg) => tg.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputTextDiff &&
        tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME
    );

  for (const tab of tabs) {
    if (!tab.isDirty) {
      await vscode.window.tabGroups.close(tab);
    }
  }
}

export const writeFileTool = new DynamicStructuredTool({
  name: "write_file",
  description: "Write content to a file in the workspace",
  schema: z.object({
    filePath: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  func: async ({ filePath, content }) => {
    try {
      const uri = vscode.Uri.file(
        path.isAbsolute(filePath)
          ? filePath
          : path.join(getWorkspaceRoot(), filePath)
      );
      const originalContent = await readFileContent(uri).catch(
        () => ""
      );
      const workspaceRoot = getWorkspaceRoot();
      const relativeFilePath = path.relative(workspaceRoot, uri.fsPath);

      await showDiff(
        originalContent,
        content,
        relativeFilePath,
        uri,
        content
      );

      return `Diff for ${relativeFilePath} displayed. File will be written in 1 second.`;
    } catch (error) {
      return `Error preparing to write file: ${error}`;
    }
  },
});
