import * as vscode from "vscode";
import * as path from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export class VSCodeTools {
  static createTools() {
    return [
      this.createReadFileTool(),
      this.createWriteFileTool(),
      this.createCreateFileTool(),
      this.createSearchFilesTool(),
      this.createListFilesTool(),
      this.createExecuteCommandTool(),
      this.createGetWorkspaceInfoTool(),
    ];
  }

  private static createReadFileTool() {
    return new DynamicStructuredTool({
      name: "read_file",
      description: "Read the contents of a file in the workspace",
      schema: z.object({
        filePath: z.string().describe("The path to the file to read"),
      }),
      func: async ({ filePath }) => {
        try {
          const uri = vscode.Uri.file(
            path.isAbsolute(filePath)
              ? filePath
              : path.join(this.getWorkspaceRoot(), filePath)
          );
          const document = await vscode.workspace.openTextDocument(uri);
          return document.getText();
        } catch (error) {
          return `Error reading file: ${error}`;
        }
      },
    });
  }

  private static createWriteFileTool() {
    return new DynamicStructuredTool({
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
              : path.join(this.getWorkspaceRoot(), filePath)
          );
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
          return `Successfully wrote to ${filePath}`;
        } catch (error) {
          return `Error writing file: ${error}`;
        }
      },
    });
  }

  private static createCreateFileTool() {
    return new DynamicStructuredTool({
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
              : path.join(this.getWorkspaceRoot(), filePath)
          );
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
          return `Successfully created ${filePath}`;
        } catch (error) {
          return `Error creating file: ${error}`;
        }
      },
    });
  }

  private static createSearchFilesTool() {
    return new DynamicStructuredTool({
      name: "search_files",
      description: "Search for text content in files within the workspace",
      schema: z.object({
        searchTerm: z.string().describe("The text to search for"),
        extensions: z
          .array(z.string())
          .optional()
          .describe("File extensions to search in (e.g., ['.ts', '.js'])"),
      }),
      func: async ({
        searchTerm,
        extensions = [".ts", ".js", ".json", ".md"],
      }) => {
        try {
          const results: Array<{
            file: string;
            line: number;
            content: string;
          }> = [];

          if (!vscode.workspace.workspaceFolders) {
            return "No workspace folder is open";
          }

          const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
          const pattern = `**/*{${extensions.join(",")}}`;
          const files = await vscode.workspace.findFiles(
            pattern,
            "**/node_modules/**"
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
  }

  private static createListFilesTool() {
    return new DynamicStructuredTool({
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
          const workspaceRoot = this.getWorkspaceRoot();
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
  }

  private static createExecuteCommandTool() {
    return new DynamicStructuredTool({
      name: "execute_command",
      description: "Execute a shell command in the workspace",
      schema: z.object({
        command: z.string().describe("The shell command to execute"),
      }),
      func: async ({ command }) => {
        try {
          const terminal = vscode.window.createTerminal({
            name: "CodingAgent Executor",
            hideFromUser: true,
          });

          return new Promise<string>((resolve) => {
            const outputFile = path.join(
              this.getWorkspaceRoot(),
              `.agent_output_${Date.now()}.tmp`
            );

            terminal.sendText(`${command} > "${outputFile}" 2>&1`);
            terminal.sendText(`echo "COMMAND_FINISHED"`);

            setTimeout(async () => {
              try {
                const uri = vscode.Uri.file(outputFile);
                const document = await vscode.workspace.openTextDocument(uri);
                const result = document.getText();
                await vscode.workspace.fs.delete(uri);
                terminal.dispose();
                resolve(result || "Command executed successfully (no output)");
              } catch (error) {
                terminal.dispose();
                resolve(`Command execution error: ${error}`);
              }
            }, 3000);
          });
        } catch (error) {
          return `Failed to execute command: ${error}`;
        }
      },
    });
  }

  private static createGetWorkspaceInfoTool() {
    return new DynamicStructuredTool({
      name: "get_workspace_info",
      description: "Get information about the current workspace",
      schema: z.object({}),
      func: async () => {
        try {
          if (!vscode.workspace.workspaceFolders) {
            return "No workspace folder is open";
          }

          const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
          const workspaceName = path.basename(workspaceRoot);

          // Try to read package.json for project info
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
  }

  private static getWorkspaceRoot(): string {
    if (!vscode.workspace.workspaceFolders) {
      throw new Error("No workspace folder is open");
    }
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
}
