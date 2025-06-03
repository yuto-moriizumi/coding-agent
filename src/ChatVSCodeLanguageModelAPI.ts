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
} from "@langchain/core/messages";
import { ChatGeneration, ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";

interface ChatVSCodeLanguageModelAPIParams extends BaseChatModelParams {
  vendor?: string;
  family?: string;
  model?: string;
}

export class ChatVSCodeLanguageModelAPI extends BaseChatModel {
  vendor: string;
  family: string;
  model?: string;

  constructor(params: ChatVSCodeLanguageModelAPIParams = {}) {
    super(params);
    this.vendor = params.vendor || "copilot";
    this.family = params.family || "gpt-4.1";
    this.model = params.model;
  }

  _llmType(): string {
    return "vscode-language-model";
  }

  async _generate(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const vscodeMessages = this.convertMessagesToVSCode(messages);
    console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    // おそらくCopilotの初期化を待たないと空の結果が返る
    const models = await vscode.lm.selectChatModels();
    console.log({ models });
    await vscode.window.showInformationMessage(
      `Available models: ${JSON.stringify(models)}`
    );
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

      const generation: ChatGeneration = {
        text: accumulatedResponse,
        message: new AIMessage(accumulatedResponse),
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
}
