import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { VSCodeTools } from "./VSCodeTools";
import { LanguageModelLike } from "@langchain/core/language_models/base";
import { SYSTEM_PROMPT } from "./constants";

export interface CodingAgentState {
  messages: BaseMessage[];
}

export class Workflow {
  private agent;

  constructor(llm: LanguageModelLike) {
    const tools = VSCodeTools.createTools();
    const memory = new MemorySaver();

    this.agent = createReactAgent({
      llm,
      tools,
      checkpointer: memory,
    });
  }

  async execute(userRequest: string): Promise<CodingAgentState> {
    // For simplicity, using a fixed thread_id.
    // In a real application, you'd manage this dynamically.
    const threadId = "coding-agent-thread";
    const config = { configurable: { thread_id: threadId } };

    try {
      const initialState = {
        messages: [
          new SystemMessage(SYSTEM_PROMPT),
          new HumanMessage(userRequest),
        ],
      };

      // Pass the config to invoke
      const result = await this.agent.invoke(initialState, config);

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
