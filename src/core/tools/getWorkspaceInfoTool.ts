import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../workspace";

export const getWorkspaceInfoTool = new DynamicStructuredTool({
  name: "get_workspace_info",
  description: "Get information about the current workspace",
  schema: z.object({}),
  func: async () => {
    try {
      if (!vscode.workspace.workspaceFolders) {
        return "No workspace folder is open";
      }

      const workspaceRoot = getWorkspaceRoot();
      const workspaceName = path.basename(workspaceRoot);

      let projectInfo = "";
      try {
        const packageJsonUri = vscode.Uri.file(
          path.join(workspaceRoot, "package.json")
        );
        const document = await vscode.workspace.openTextDocument(
          packageJsonUri
        );
        const packageJson = JSON.parse(document.getText());
        projectInfo = `Project: ${
          packageJson.name || workspaceName
        }\nDescription: ${packageJson.description || "N/A"}\nVersion: ${
          packageJson.version || "N/A"
        }`;
      } catch {
        projectInfo = `Workspace: ${workspaceName}`;
      }

      return `Workspace Information:\n${projectInfo}\nPath: ${workspaceRoot}`;
    } catch (error) {
      return `Error getting workspace info: ${error}`;
    }
  },
});
