import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { VSCodeReactTools } from "./VSCodeReactTools";
import { LanguageModelLike } from "@langchain/core/language_models/base";

export interface CodingAgentState {
  messages: BaseMessage[];
}

export class Workflow {
  private agent;

  constructor(llm: LanguageModelLike) {
    const tools = VSCodeReactTools.createTools();

    this.agent = createReactAgent({
      llm,
      tools,
    });
  }

  async execute(userRequest: string): Promise<CodingAgentState> {
    try {
      const initialState = {
        messages: [new HumanMessage(userRequest)],
      };

      const result = await this.agent.invoke(initialState);

      return {
        messages: result.messages || [],
      };
    } catch (error) {
      return {
        messages: [new HumanMessage(`❌ Agent execution error: ${error}`)],
      };
    }
  }
}
