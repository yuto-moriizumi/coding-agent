export function getSystemPrompt(activeFilePath?: string, openFilePaths?: string[]): string {
  let prompt = `Use tools as much as possible.
Check the opened files and workspace to get the context.`;

  if (activeFilePath) {
    prompt += `\n\nCurrently active file: ${activeFilePath}`;
  }

  if (openFilePaths && openFilePaths.length > 0) {
    prompt += `\n\nOther open files: ${openFilePaths.join(", ")}`;
  }

  return prompt;
}
