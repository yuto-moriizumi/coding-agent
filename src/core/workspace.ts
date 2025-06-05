import * as vscode from "vscode";

export function getWorkspaceRoot(): string {
  if (!vscode.workspace.workspaceFolders) {
    throw new Error("No workspace folder is open");
  }
  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}
