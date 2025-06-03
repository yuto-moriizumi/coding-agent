import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatVSCodeLanguageModelAPI } from "./ChatVSCodeLanguageModelAPI";
import { VSCodeFileOperations, TodoItem } from "./VSCodeTools";

export interface CodingAgentState {
  messages: BaseMessage[];
  userRequest: string;
  todoList: TodoItem[];
  currentTodo?: TodoItem;
  results: string[];
  workspaceRoot: string;
  isComplete: boolean;
}

export class Workflow {
  private llm: ChatVSCodeLanguageModelAPI;

  constructor() {
    this.llm = new ChatVSCodeLanguageModelAPI({
      vendor: "copilot",
      family: "gpt-4.1",
    });
  }

  async analyzeTodo(
    state: CodingAgentState
  ): Promise<Partial<CodingAgentState>> {
    try {
      const workspaceRoot = VSCodeFileOperations.getWorkspaceRoot();

      const analysisPrompt = `
Analyze this user request for coding tasks: "${state.userRequest}"

Context: Working in VS Code workspace at ${workspaceRoot}

Please analyze what the user wants to achieve and provide a brief analysis.
Focus on understanding the main goal and any specific requirements.
`;

      const messages = [new HumanMessage(analysisPrompt)];
      const result = await this.llm.invoke(messages);

      return {
        messages: [new AIMessage(`Analysis: ${result.content}`)],
        workspaceRoot,
      };
    } catch (error) {
      return {
        messages: [new AIMessage(`Analysis failed: ${error}`)],
        isComplete: true,
      };
    }
  }

  async createTodoList(
    state: CodingAgentState
  ): Promise<Partial<CodingAgentState>> {
    try {
      const todoPrompt = `
Based on this user request: "${state.userRequest}"
Working directory: ${state.workspaceRoot}

Create a detailed TODO list for this coding task. Each TODO should be:
1. Specific and actionable
2. Include file paths when relevant
3. Be ordered logically

Return a JSON array of todos in this format:
[
  {
    "id": "1",
    "description": "Read existing package.json to understand project structure",
    "filePath": "package.json"
  },
  {
    "id": "2", 
    "description": "Create new component file with basic structure",
    "filePath": "src/components/NewComponent.tsx"
  }
]

Only return the JSON array, no other text.
`;

      const messages = state.messages.concat([new HumanMessage(todoPrompt)]);
      const result = await this.llm.invoke(messages);

      let todoList: TodoItem[] = [];
      try {
        const content = result.content as string;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsedTodos = JSON.parse(jsonMatch[0]);
          todoList = parsedTodos.map((todo: any) => ({
            ...todo,
            status: "pending" as const,
          }));
        }
      } catch (parseError) {
        // Fallback: create a simple todo
        todoList = [
          {
            id: "1",
            description: `Complete user request: ${state.userRequest}`,
            status: "pending" as const,
          },
        ];
      }

      return {
        messages: [
          new AIMessage(`Created TODO list with ${todoList.length} items`),
        ],
        todoList,
      };
    } catch (error) {
      return {
        messages: [new AIMessage(`Failed to create TODO list: ${error}`)],
        isComplete: true,
      };
    }
  }

  async executeTodo(
    state: CodingAgentState
  ): Promise<Partial<CodingAgentState>> {
    const pendingTodos = state.todoList.filter(
      (todo) => todo.status === "pending"
    );

    if (pendingTodos.length === 0) {
      return { isComplete: true };
    }

    const currentTodo = pendingTodos[0];
    const updatedTodoList = state.todoList.map((todo) =>
      todo.id === currentTodo.id
        ? { ...todo, status: "in_progress" as const }
        : todo
    );

    try {
      const executionPrompt = `
Execute this TODO: "${currentTodo.description}"
File path: ${currentTodo.filePath || "Not specified"}
Workspace: ${state.workspaceRoot}

Analyze what needs to be done and provide the exact steps to execute this TODO.
If it involves file operations, provide the specific content or commands needed.

Respond with a JSON object:
{
  "action": "read_file" | "write_file" | "create_file" | "search_files" | "execute_command",
  "target": "file path or search term or command",
  "content": "file content if writing/creating",
  "reasoning": "explanation of what you're doing"
}

Only return the JSON object, no other text.
`;

      const messages = state.messages.concat([
        new HumanMessage(executionPrompt),
      ]);
      const result = await this.llm.invoke(messages);

      let actionResult = "";
      let todoStatus: "completed" | "failed" = "completed";
      let error: string | undefined;

      try {
        const content = result.content as string;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const action = JSON.parse(jsonMatch[0]);

          switch (action.action) {
            case "read_file":
              actionResult = await VSCodeFileOperations.readFile(action.target);
              break;
            case "write_file":
              await VSCodeFileOperations.writeFile(
                action.target,
                action.content
              );
              actionResult = `Successfully wrote to ${action.target}`;
              break;
            case "create_file":
              await VSCodeFileOperations.createFile(
                action.target,
                action.content
              );
              actionResult = `Successfully created ${action.target}`;
              break;
            case "search_files":
              const searchResults = await VSCodeFileOperations.searchInFiles(
                action.target
              );
              actionResult = `Found ${searchResults.length} matches for "${action.target}"`;
              break;
            case "execute_command":
              actionResult = await VSCodeFileOperations.executeCommand(
                action.target
              );
              break;
            default:
              actionResult = `Unknown action: ${action.action}`;
              todoStatus = "failed";
          }
        } else {
          actionResult = "Could not parse action from AI response";
          todoStatus = "failed";
        }
      } catch (executeError) {
        actionResult = `Execution failed: ${executeError}`;
        todoStatus = "failed";
        error =
          executeError instanceof Error
            ? executeError.message
            : String(executeError);
      }

      const finalTodoList = updatedTodoList.map((todo) =>
        todo.id === currentTodo.id
          ? { ...todo, status: todoStatus, error }
          : todo
      );

      return {
        messages: [
          new AIMessage(`Executed TODO ${currentTodo.id}: ${actionResult}`),
        ],
        todoList: finalTodoList,
        currentTodo,
        results: [actionResult],
      };
    } catch (error) {
      const failedTodoList = updatedTodoList.map((todo) =>
        todo.id === currentTodo.id
          ? { ...todo, status: "failed" as const, error: String(error) }
          : todo
      );

      return {
        messages: [
          new AIMessage(`Failed to execute TODO ${currentTodo.id}: ${error}`),
        ],
        todoList: failedTodoList,
        currentTodo,
        results: [`Failed: ${error}`],
      };
    }
  }

  async verifyTodo(
    state: CodingAgentState
  ): Promise<Partial<CodingAgentState>> {
    if (!state.currentTodo) {
      return { isComplete: true };
    }

    const verificationPrompt = `
Verify if this TODO was completed successfully: "${
      state.currentTodo.description
    }"
Current status: ${state.currentTodo.status}
Result: ${state.results[state.results.length - 1] || "No result"}

Was this TODO completed successfully? Respond with just "YES" or "NO" and a brief explanation.
`;

    try {
      const messages = state.messages.concat([
        new HumanMessage(verificationPrompt),
      ]);
      const result = await this.llm.invoke(messages);

      const verificationResult = result.content as string;
      const isSuccess = verificationResult.toLowerCase().includes("yes");

      const updatedTodoList = state.todoList.map((todo) =>
        todo.id === state.currentTodo!.id
          ? {
              ...todo,
              status: isSuccess ? ("completed" as const) : ("failed" as const),
            }
          : todo
      );

      return {
        messages: [new AIMessage(`Verification: ${verificationResult}`)],
        todoList: updatedTodoList,
      };
    } catch (error) {
      return {
        messages: [new AIMessage(`Verification failed: ${error}`)],
        isComplete: true,
      };
    }
  }

  private shouldContinue(state: CodingAgentState): boolean {
    const pendingTodos = state.todoList.filter(
      (todo) => todo.status === "pending"
    );
    return pendingTodos.length > 0;
  }

  async displayResults(
    state: CodingAgentState
  ): Promise<Partial<CodingAgentState>> {
    const completedTodos = state.todoList.filter(
      (todo) => todo.status === "completed"
    );
    const failedTodos = state.todoList.filter(
      (todo) => todo.status === "failed"
    );

    const summary = `
## Task Completion Summary

**User Request:** ${state.userRequest}

**Completed TODOs:** ${completedTodos.length}/${state.todoList.length}

${completedTodos.map((todo) => `✅ ${todo.description}`).join("\n")}

${
  failedTodos.length > 0
    ? `\n**Failed TODOs:**\n${failedTodos
        .map(
          (todo) =>
            `❌ ${todo.description}${todo.error ? ` (${todo.error})` : ""}`
        )
        .join("\n")}`
    : ""
}

**Results:**
${state.results.join("\n")}
`;

    return {
      messages: [new AIMessage(summary)],
      isComplete: true,
    };
  }

  async execute(userRequest: string): Promise<CodingAgentState> {
    let state: CodingAgentState = {
      messages: [],
      userRequest,
      todoList: [],
      results: [],
      workspaceRoot: "",
      isComplete: false,
    };

    try {
      // Step 1: Analyze Todo
      const analyzed = await this.analyzeTodo(state);
      state = { ...state, ...analyzed };

      // Step 2: Create Todo List
      const todoCreated = await this.createTodoList(state);
      state = { ...state, ...todoCreated };

      // Step 3: Execute Todos
      while (this.shouldContinue(state) && !state.isComplete) {
        const executed = await this.executeTodo(state);
        state = { ...state, ...executed };

        if (state.currentTodo) {
          const verified = await this.verifyTodo(state);
          state = { ...state, ...verified };
        }

        // Safety check to prevent infinite loops
        if (state.todoList.filter((t) => t.status === "pending").length === 0) {
          break;
        }
      }

      // Step 4: Display Results
      const results = await this.displayResults(state);
      state = { ...state, ...results, isComplete: true };
    } catch (error) {
      state.messages.push(new AIMessage(`❌ Workflow error: ${error}`));
      state.isComplete = true;
    }

    return state;
  }
}
