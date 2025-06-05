import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../workspace";

export const createFileTool = new DynamicStructuredTool({
  name: "create_file",
  description: "Create a new file with content in the workspace",
  schema: z.object({
    filePath: z.string().describe("The path where to create the file"),
    content: z.string().describe("The initial content for the file"),
  }),
  func: async ({ filePath, content }) => {
    try {
      const uri = vscode.Uri.file(
        path.isAbsolute(filePath)
          ? filePath
          : path.join(getWorkspaceRoot(), filePath),
      );
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
      return `Successfully created ${filePath}`;
    } catch (error) {
      return `Error creating file: ${error}`;
    }
  },
});
