import { readFileTool } from "./tools/readFileTool";
import { writeFileTool } from "./tools/writeFileTool";
import { createFileTool } from "./tools/createFileTool";
import { searchFilesTool } from "./tools/searchFilesTool";
import { listFilesTool } from "./tools/listFilesTool";
import { executeCommandTool } from "./tools/executeCommandTool";
import { getWorkspaceInfoTool } from "./tools/getWorkspaceInfoTool";

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
