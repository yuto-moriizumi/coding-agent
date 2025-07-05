import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../getWorkspaceRoot";

const searchFilesSchema = z.object({
  searchTerm: z.string().describe("The text to search for"),
  extensions: z
    .array(z.string())
    .optional()
    .describe("File extensions to search in (e.g., ['.ts', '.js'])"),
});

export const searchFilesTool = new DynamicStructuredTool({
  name: "search_files",
  description: "Search for text content in files within the workspace",
  schema: searchFilesSchema,
  func: async ({ searchTerm, extensions = [".ts", ".js", ".json", ".md"] }: z.infer<typeof searchFilesSchema>) => {
    try {
      const results: Array<{
        file: string;
        line: number;
        content: string;
      }> = [];

      if (!vscode.workspace.workspaceFolders) {
        return "No workspace folder is open";
      }

      const workspaceRoot = getWorkspaceRoot();
      const pattern = `**/*{${extensions.join(",")}}`;
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
      );

      for (const file of files) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const content = document.getText();
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
              results.push({
                file: path.relative(workspaceRoot, file.fsPath),
                line: index + 1,
                content: line.trim(),
              });
            }
          });
        } catch (error) {
          // Skip files that can't be read
        }
      }

      return `Found ${results.length} matches:\n${results
        .map((r) => `${r.file}:${r.line} - ${r.content}`)
        .join("\n")}`;
    } catch (error) {
      return `Search failed: ${error}`;
    }
  },
});
