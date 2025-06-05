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
    this.family = params.family || "gpt-4.1";
    this.model = params.model;
    this.tools = params.tools; // tools を初期化
    console.log(
      `ChatVSCodeLanguageModelAPI initialized with ${
        params.tools?.length ?? 0
      } tools`
    );
  }

  _llmType(): string {
    return "vscode-language-model";
  }

  async _generate(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
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
          return `- toolName: ${toolName}\n  description: ${toolDescription}\n  parameters: ${toolParameters}`;
        })
        .join("\n");

      const toolPrompt = `
You have access to the following tools:
${toolDescriptions}

If you need to use a tool, respond ONLY with a JSON object in the following format (do not include any other text before or after the JSON):
{
  "type": "tool_call",
  "call": {
    "name": "TOOL_NAME",
    "arguments": { "ARG_NAME": "ARG_VALUE", ... }
  }
}
Ensure the arguments object is a valid JSON object.
If you do not need to use a tool, respond to the user directly as plain text.`;

      let lastHumanMessageIndex = -1;
      for (let i = processedMessages.length - 1; i >= 0; i--) {
        if (
          processedMessages[i].lc_serializable &&
          processedMessages[i] instanceof HumanMessage // Check if it's a HumanMessage instance
        ) {
          lastHumanMessageIndex = i;
          break;
        }
      }

      if (lastHumanMessageIndex !== -1) {
        const originalContent =
          processedMessages[lastHumanMessageIndex].content;
        processedMessages[lastHumanMessageIndex] = new HumanMessage({
          content: `${originalContent}\n\n${toolPrompt}`,
        });
      } else {
        // Fallback: if no human message, add to the first message if it's human,
        // or create a new human message at the beginning.
        // This part might need adjustment based on expected agent behavior.
        const humanMessageWithPrompt = new HumanMessage({
          content: toolPrompt,
        });
        if (
          processedMessages.length > 0 &&
          processedMessages[0].lc_serializable &&
          processedMessages[0] instanceof HumanMessage
        ) {
          const existingContent = processedMessages[0].content;
          processedMessages[0] = new HumanMessage({
            content: `${existingContent}\n\n${toolPrompt}`,
          });
        } else {
          processedMessages.unshift(humanMessageWithPrompt);
        }
        console.warn(
          "Tool prompt was not appended to an existing HumanMessage. It was added to the beginning or a new message."
        );
      }
    }

    const vscodeMessages = this.convertMessagesToVSCode(processedMessages);
    // console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); // Original log line
    // おそらくCopilotの初期化を待たないと空の結果が返る
    const models = await vscode.lm.selectChatModels();
    console.log({ models });
    await vscode.window.showInformationMessage(
      `Available models: ${JSON.stringify(models)}`
    );
    console.log(141);
    const [model] = await vscode.lm.selectChatModels({
      vendor: this.vendor,
      family: this.family,
      ...(this.model && { model: this.model }),
    });

    if (!model) {
      throw new Error(
        `No VS Code Language Model found for vendor: ${this.vendor}, family: ${this.family}`
      );
    }
    console.log(152);

    const cancellationToken = options?.signal
      ? this.createCancellationToken(options.signal)
      : new vscode.CancellationTokenSource().token;

    try {
      const chatResponse = await model.sendRequest(
        vscodeMessages,
        {},
        cancellationToken
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
    messages: BaseMessage[]
  ): vscode.LanguageModelChatMessage[] {
    return messages.map((message) => {
      if (message instanceof HumanMessage) {
        return vscode.LanguageModelChatMessage.User(message.content as string);
      } else if (message instanceof AIMessage) {
        return vscode.LanguageModelChatMessage.Assistant(
          message.content as string
        );
      } else if (message instanceof SystemMessage) {
        return vscode.LanguageModelChatMessage.User(message.content as string);
      } else {
        return vscode.LanguageModelChatMessage.User(message.content as string);
      }
    });
  }

  private createCancellationToken(
    signal: AbortSignal
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

    kwargs?: Partial<any> // kwargs の型をより具体的にすることも可能
  ): Runnable<BaseLanguageModelInput, AIMessageChunk> {
    const toolDefinitions = tools.map(convertToOpenAITool); // convertToToolDefinition を convertToOpenAITool に変更

    // 仮実装としてツールを登録しない
    return new ChatVSCodeLanguageModelAPI({
      ...this.invocationParams(), // _lc_params の代わりに invocationParams() を使用
      tools: [],
      ...kwargs,
    });
    const constructor = this.constructor as new (
      params: ChatVSCodeLanguageModelAPIParams & { [key: string]: any }
    ) => this;
    console.log("Binding tools:", toolDefinitions);
    return new constructor({
      ...this.invocationParams(), // _lc_params の代わりに invocationParams() を使用
      tools: toolDefinitions,
      ...kwargs,
    });
  }
}
