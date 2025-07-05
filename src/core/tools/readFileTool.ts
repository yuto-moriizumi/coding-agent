import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../getWorkspaceRoot";

const readFileSchema = z.object({
  filePath: z.string().describe("The path to the file to read"),
});

export const readFileTool = new DynamicStructuredTool({
  name: "read_file",
  description: "Read the contents of a file in the workspace",
  schema: readFileSchema,
  func: async ({ filePath }: z.infer<typeof readFileSchema>) => {
    try {
      const uri = vscode.Uri.file(
        path.isAbsolute(filePath)
          ? filePath
          : path.join(getWorkspaceRoot(), filePath),
      );
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      return `Error reading file: ${error}`;
    }
  },
});
