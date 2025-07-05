import { readFileTool } from "./readFileTool";
import { writeFileTool } from "./writeFileTool";
import { createFileTool } from "./createFileTool";
import { searchFilesTool } from "./searchFilesTool";
import { listFilesTool } from "./listFilesTool";
import { executeCommandTool } from "./executeCommandTool";
import { getWorkspaceInfoTool } from "./getWorkspaceInfoTool";

export function createVSCodeTools() {
  return [
    readFileTool,
    writeFileTool,
    createFileTool,
    searchFilesTool,
    listFilesTool,
    executeCommandTool,
    getWorkspaceInfoTool,
  ];
}
