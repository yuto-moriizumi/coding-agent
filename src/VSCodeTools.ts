import * as vscode from "vscode";
import * as path from "path";

export interface TodoItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  filePath?: string;
  lineNumber?: number;
  error?: string;
}

export class VSCodeFileOperations {
  static async readFile(filePath: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error}`);
    }
  }

  static async appendToFile(filePath: string, content: string): Promise<void> {
    try {
      const existing = await this.readFile(filePath);
      await this.writeFile(filePath, existing + content);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Failed to read file")
      ) {
        // File doesn't exist, create it
        await this.writeFile(filePath, content);
      } else {
        throw error;
      }
    }
  }

  static async searchInFiles(
    searchTerm: string,
    extensions: string[] = [".ts", ".js", ".json"]
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];

    if (!vscode.workspace.workspaceFolders) {
      return results;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

    try {
      const pattern = `**/*{${extensions.join(",")}}`;
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**"
      );

      for (const file of files) {
        try {
          const content = await this.readFile(file.fsPath);
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
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }

    return results;
  }

  static async createFile(
    filePath: string,
    content: string = ""
  ): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
    } catch (error) {
      throw new Error(`Failed to create file ${filePath}: ${error}`);
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      throw new Error(`Failed to delete file ${filePath}: ${error}`);
    }
  }

  static async listFiles(directoryPath: string): Promise<string[]> {
    try {
      const uri = vscode.Uri.file(directoryPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries
        .filter(([name, type]) => type === vscode.FileType.File)
        .map(([name]) => name);
    } catch (error) {
      throw new Error(`Failed to list files in ${directoryPath}: ${error}`);
    }
  }

  static getWorkspaceRoot(): string {
    if (!vscode.workspace.workspaceFolders) {
      throw new Error("No workspace folder is open");
    }
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  static async executeCommand(command: string): Promise<string> {
    try {
      const terminal = vscode.window.createTerminal({
        name: "CodingAgent Executor",
        hideFromUser: true,
      });

      return new Promise((resolve, reject) => {
        let output = "";

        // Create a temporary file to capture output
        const outputFile = path.join(
          this.getWorkspaceRoot(),
          `.codingAgent_output_${Date.now()}.tmp`
        );

        terminal.sendText(`${command} > "${outputFile}" 2>&1`);
        terminal.sendText(`echo "COMMAND_FINISHED"`);

        // Wait a bit and then read the output file
        setTimeout(async () => {
          try {
            const result = await this.readFile(outputFile);
            await this.deleteFile(outputFile);
            terminal.dispose();
            resolve(result);
          } catch (error) {
            terminal.dispose();
            reject(error);
          }
        }, 2000);
      });
    } catch (error) {
      throw new Error(`Failed to execute command: ${error}`);
    }
  }
}
