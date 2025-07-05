import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../getWorkspaceRoot";

export const listFilesTool = new DynamicStructuredTool({
  name: "list_files",
  description: "List files in a directory within the workspace",
  schema: z.object({
    directoryPath: z
      .string()
      .optional()
      .describe("The directory path to list (defaults to workspace root)"),
  }),
  func: async ({ directoryPath = "" }) => {
    try {
      const workspaceRoot = getWorkspaceRoot();
      const fullPath = path.join(workspaceRoot, directoryPath);
      const uri = vscode.Uri.file(fullPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      const files = entries
        .filter(([, type]) => type === vscode.FileType.File)
        .map(([name]) => name);

      const directories = entries
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => `${name}/`);

      return `Files in ${directoryPath || "workspace root"}:\n${directories
        .concat(files)
        .join("\n")}`;
    } catch (error) {
      return `Error listing files: ${error}`;
    }
  },
});
