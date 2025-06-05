import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as vscode from "vscode";
import * as path from "path";
import { getWorkspaceRoot } from "../workspace";

export const executeCommandTool = new DynamicStructuredTool({
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

      const outputFile = path.join(
        getWorkspaceRoot(),
        `.agent_output_${Date.now()}.tmp`,
      );

      terminal.sendText(`${command} > "${outputFile}" 2>&1`);
      terminal.sendText(`echo "COMMAND_FINISHED"`);

      await new Promise<void>((resolve) => setTimeout(resolve, 3000)); // 3秒待機

      try {
        const uri = vscode.Uri.file(outputFile);
        const document = await vscode.workspace.openTextDocument(uri);
        const result = document.getText();
        await vscode.workspace.fs.delete(uri);
        terminal.dispose();
        return result || "Command executed successfully (no output)";
      } catch (error) {
        terminal.dispose();
        return `Command execution error: ${error}`;
      }
    } catch (error) {
      return `Failed to execute command: ${error}`;
    }
  },
});
