import * as vscode from "vscode";
import {
  BaseChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  AIMessageChunk, // AIMessageChunk をインポート
} from "@langchain/core/messages";
import { ChatGeneration, ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  convertToOpenAITool, // convertToToolDefinition を convertToOpenAITool に変更
} from "@langchain/core/utils/function_calling";
import { Runnable } from "@langchain/core/runnables";
import {
  BaseLanguageModelInput,
  ToolDefinition,
} from "@langchain/core/language_models/base"; // ToolDefinition をこちらからインポート
import { StructuredToolInterface } from "@langchain/core/tools";

interface ChatVSCodeLanguageModelAPIParams extends BaseChatModelParams {
  vendor?: string;
  family?: string;
  model?: string;
  tools?: ToolDefinition[]; // OpenAITool を ToolDefinition に戻す
}

export class ChatVSCodeLanguageModelAPI extends BaseChatModel {
  vendor: string;
  family: string;
  model?: string;
  protected tools?: ToolDefinition[]; // OpenAITool を ToolDefinition に戻す

  constructor(params: ChatVSCodeLanguageModelAPIParams = {}) {
    super(params);
    this.vendor = params.vendor || "copilot";
    this.family = params.family || "gpt-4o"; // Updated to use recommended gpt-4o
    this.model = params.model;
    this.tools = params.tools; // tools を初期化
    console.log(
      `ChatVSCodeLanguageModelAPI initialized with vendor: ${this.vendor}, family: ${this.family}, tools: ${
        params.tools?.length ?? 0
      }`,
    );
  }

  _llmType(): string {
    return "vscode-language-model";
  }

  async _generate(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    let processedMessages = [...messages];

    if (this.tools && this.tools.length > 0) {
      const toolDescriptions = this.tools
        .map((tool) => {
          // Ensure tool.function and its properties are defined
          const toolName = tool.function?.name || "unknown_tool";
          const toolDescription =
            tool.function?.description || "No description";
          const toolParameters = tool.function?.parameters
            ? JSON.stringify(tool.function.parameters)
            : "{}";
          return `- Tool Name: ${toolName}\n  Description: ${toolDescription}\n  Parameters: ${toolParameters}`;
        })
        .join("\n\n");

      const toolPrompt = `
You have access to the following tools:
${toolDescriptions}

When you need to use a tool, respond ONLY with a JSON object in this exact format:
{
  "type": "tool_call",
  "call": {
    "name": "TOOL_NAME",
    "arguments": { "param_name": "param_value" }
  }
}

Important guidelines:
- Use tools when the user's request requires specific actions (file operations, code execution, etc.)
- The JSON must be valid and complete
- Do not include any explanatory text before or after the JSON
- If you don't need to use a tool, respond with regular text`;

      // Add system message with tool instructions at the beginning
      const systemMessage = new SystemMessage({
        content: toolPrompt,
      });
      processedMessages.unshift(systemMessage);
    }

    const vscodeMessages = this.convertMessagesToVSCode(processedMessages);

    // Select chat models with retry logic
    const models = await this.selectChatModelsWithRetry();

    if (models.length === 0) {
      throw new Error(
        `No VS Code Language Model found for vendor: ${this.vendor}, family: ${this.family}${
          this.model ? `, model: ${this.model}` : ""
        }. Please ensure the required language model is available and you have proper permissions.`,
      );
    }

    // Use the first available model
    const [model] = models;
    console.log(`Using model: ${model.vendor}/${model.family} (${model.id})`);
    console.log(`Model token limit: ${model.maxInputTokens}`);

    const cancellationToken = options?.signal
      ? this.createCancellationToken(options.signal)
      : new vscode.CancellationTokenSource().token;

    try {
      const chatResponse = await model.sendRequest(
        vscodeMessages,
        {},
        cancellationToken,
      );

      let accumulatedResponse = "";
      for await (const fragment of chatResponse.text) {
        accumulatedResponse += fragment;
      }

      let message: AIMessage;
      try {
        // Attempt to parse the response as a tool call JSON
        const parsedJson = JSON.parse(accumulatedResponse);
        if (
          parsedJson.type === "tool_call" &&
          parsedJson.call &&
          parsedJson.call.name &&
          parsedJson.call.arguments
        ) {
          // It's a tool call
          const toolCallId = `tool_call_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 10)}`; // Generate a unique ID
          message = new AIMessage({
            content: "", // For tool calls, content is often empty or a summary
            tool_calls: [
              {
                id: toolCallId,
                name: parsedJson.call.name,
                args: parsedJson.call.arguments,
              },
            ],
          });
        } else {
          // It's a JSON, but not the expected tool call format
          message = new AIMessage(accumulatedResponse);
        }
      } catch (e) {
        // Not a JSON, or malformed JSON, so treat as plain text response
        message = new AIMessage(accumulatedResponse);
      }

      const generation: ChatGeneration = {
        text:
          message.content === "" &&
          message.tool_calls &&
          message.tool_calls.length > 0
            ? JSON.stringify(message.tool_calls) // Or some other textual representation if needed
            : accumulatedResponse,
        message: message,
      };

      return {
        generations: [generation],
      };
    } catch (error) {
      throw new Error(`VS Code Language Model API error: ${error}`);
    }
  }

  private convertMessagesToVSCode(
    messages: BaseMessage[],
  ): vscode.LanguageModelChatMessage[] {
    return messages.map((message) => {
      if (message instanceof HumanMessage) {
        return vscode.LanguageModelChatMessage.User(message.content as string);
      } else if (message instanceof AIMessage) {
        return vscode.LanguageModelChatMessage.Assistant(
          message.content as string,
        );
      } else if (message instanceof SystemMessage) {
        return vscode.LanguageModelChatMessage.User(
          `System: ${message.content as string}`,
        );
      } else {
        return vscode.LanguageModelChatMessage.User(message.content as string);
      }
    });
  }

  /**
   * VSCode側で何らかの初期化処理が行われており、それを待たないとselectChatModelsは空配列を返す
   * そこでリトライを行う。
   */
  private async selectChatModelsWithRetry(
    maxRetries: number = 5,
  ): Promise<vscode.LanguageModelChat[]> {
    const selector = {
      vendor: this.vendor,
      family: this.family,
      ...(this.model && { model: this.model }),
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      console.log(
        `Attempting to select chat models (attempt ${attempt + 1}/${maxRetries + 1})...`,
      );
      const models = await vscode.lm.selectChatModels(selector);

      if (models.length > 0) {
        console.log(
          `Successfully found ${models.length} model(s) on attempt ${attempt + 1}`,
        );
        return models;
      }

      if (attempt < maxRetries) {
        console.log(
          `No models found on attempt ${attempt + 1}, retrying after 500ms...`,
        );
        await this.delay(1000);
      } else {
        console.log(`No models found after ${maxRetries + 1} attempts`);
      }
    }

    return [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createCancellationToken(
    signal: AbortSignal,
  ): vscode.CancellationToken {
    const source = new vscode.CancellationTokenSource();

    if (signal.aborted) {
      source.cancel();
    } else {
      signal.addEventListener("abort", () => source.cancel());
    }

    return source.token;
  }

  // bindTools メソッドの実装
  public bindTools(
    tools: (StructuredToolInterface | Record<string, unknown>)[],
    kwargs?: Partial<any>, // kwargs の型をより具体的にすることも可能
  ): Runnable<BaseLanguageModelInput, AIMessageChunk> {
    const toolDefinitions = tools.map(convertToOpenAITool); // convertToToolDefinition を convertToOpenAITool に変更

    const constructor = this.constructor as new (
      params: ChatVSCodeLanguageModelAPIParams & { [key: string]: any },
    ) => this;
    console.log("Binding tools:", toolDefinitions);
    return new constructor({
      ...this.invocationParams(), // _lc_params の代わりに invocationParams() を使用
      tools: toolDefinitions,
      ...kwargs,
    });
  }
}
