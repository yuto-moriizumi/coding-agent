export interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  category: string;
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // GPT-4.1 Series - WebDev Arenaトップパフォーマー
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description:
      "Top-tier coding model with 1M token context (Rank #8 in WebDev Arena)",
    category: "gpt-4.1",
  },
  // Reasoning Models (o-series) - WebDev Arena実績基準で順序付け
  {
    id: "o3",
    name: "O3",
    description:
      "OpenAI's most powerful reasoning model (Rank #10 in WebDev Arena)",
    category: "reasoning",
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description:
      "Fast, efficient model excelling in instruction-following and coding (Rank #10 in WebDev Arena)",
    category: "gpt-4.1",
  },
];

// デフォルトモデル
export const DEFAULT_OPENAI_MODEL = "gpt-4.1";

// カテゴリ別モデル取得
export function getModelsByCategory(category: string): OpenAIModel[] {
  return OPENAI_MODELS.filter((model) => model.category === category);
}

// モデルID検索
export function getModelById(id: string): OpenAIModel | undefined {
  return OPENAI_MODELS.find((model) => model.id === id);
}

// 推論モデルかどうかの判定
export function isReasoningModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.category === "reasoning" || false;
}
