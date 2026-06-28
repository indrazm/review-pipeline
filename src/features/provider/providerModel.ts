import { AnthropicClient } from "@anvia/anthropic";
import { createCompletion, type CompletionModel } from "@anvia/core";
import { OpenAIClient } from "@anvia/openai";
import type { ProviderConfig } from "./providerConfig.js";

export function createCompletionModelFromProviderConfig(
  config: ProviderConfig,
): CompletionModel {
  if (config.type === "openai-compatible") {
    return new OpenAIClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      completionApi: "chat",
    }).completionModel(config.model);
  }

  return new AnthropicClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  }).completionModel(config.model);
}

export async function verifyProviderConfig(
  config: ProviderConfig,
): Promise<void> {
  await createCompletion(createCompletionModelFromProviderConfig(config), {
    input: "Reply with only: OK",
    maxTokens: 8,
    temperature: 0,
  });
}
