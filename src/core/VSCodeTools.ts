import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises"; // fs/promises をインポート
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const DIFF_VIEW_URI_SCHEME = "agent-diff"; // Clineのスキームを参考に独自のスキームを定義

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
          const originalContent = await this.readFileContent(uri).catch(
            () => ""
          ); // ファイルが存在しない場合は空文字列
          const workspaceRoot = this.getWorkspaceRoot();
          const relativeFilePath = path.relative(workspaceRoot, uri.fsPath);

          // Diffを表示し、1秒後に実際の書き込みを行う
          await this.showDiff(
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
  }

  private static async readFileContent(uri: vscode.Uri): Promise<string> {
    try {
      // ディスク上のファイルを直接読み込む
      const content = await fs.readFile(uri.fsPath, { encoding: 'utf8' });
      return content;
    } catch (error) {
      // ファイルが存在しないなどのエラーは無視し、空文字列を返す
      return "";
    }
  }

  private static async showDiff(
    originalContent: string,
    modifiedContent: string,
    fileName: string,
    targetUri: vscode.Uri,
    finalContent: string
  ) {
    const workspaceRoot = this.getWorkspaceRoot();
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

    // 一時ファイルは不要になるため、直接URIを構築
    const originalUri = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
      query: originalContentBase64, // Base64エンコードしてクエリに渡す
    });
    const modifiedUri = targetUri; // 変更後のファイルは実際のファイルURIを使用

    const fileExists = originalContent !== ""; // 元のコンテンツがあればファイルは存在するとみなす
    const title = `${fileName}: ${fileExists ? "Original ↔ Agent's Changes" : "New File"} (Editable)`;

    // Diffエディタを開く前に、実際のファイルの内容を更新
    try {
      const document = await vscode.workspace.openTextDocument(targetUri);
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, modifiedContent);
      await vscode.workspace.applyEdit(edit);
      // ドキュメントがダーティになっている可能性があるので保存
      if (document.isDirty) {
        await document.save();
      }
    } catch (error) {
      console.error(`Error updating target file before diff: ${error}`);
      vscode.window.showErrorMessage(`Diff表示前にファイルの更新に失敗しました: ${fileName} - ${error}`);
      return; // エラーが発生した場合は処理を中断
    }

    await vscode.commands.executeCommand(
      "vscode.diff",
      originalUri,
      modifiedUri,
      title,
      { preview: true }
    );

    // 2秒後に実際の書き込みと後処理
    setTimeout(async () => {
      try {
        // ファイルは既に更新されているため、fs.writeFileは不要
        vscode.window.showInformationMessage(
          `ファイル '${fileName}' を更新しました。`
        );

        // Diffエディタのタブを閉じる
        await this.closeAgentDiffViews();

        // Diffエディタが完全に閉じるのを待ってから、編集後のファイルを開く
        await new Promise((resolve) => setTimeout(resolve, 200)); // 200msの遅延
        await vscode.window.showTextDocument(targetUri);
      } catch (error) {
        vscode.window.showErrorMessage(
          `ファイルの書き込み中にエラーが発生しました: ${fileName} - ${error}`
        );
      } finally {
        // 一時ファイルは使用しないため、削除ロジックは不要
      }
    }, 2000); // ユーザーの要望により2秒に変更

  }

  private static async closeAgentDiffViews() {
    const tabs = vscode.window.tabGroups.all
      .flatMap((tg) => tg.tabs)
      .filter(
        (tab) =>
          tab.input instanceof vscode.TabInputTextDiff &&
          tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME
      );

    for (const tab of tabs) {
      // 変更が保存されていないDiffビューは閉じない（保存ポップアップを避けるため）
      if (!tab.isDirty) {
        await vscode.window.tabGroups.close(tab);
      }
    }
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
