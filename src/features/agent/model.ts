import { OpenAIClient } from "@anvia/openai";

export const AGENT_MAX_TURNS = 75;

const DEFAULT_MODEL = "cx/gpt-5.5";

export function createCompletionModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  const client = new OpenAIClient({
    ...(apiKey === undefined || apiKey === "" ? {} : { apiKey }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
    completionApi: "chat",
  });

  return client.completionModel(model === undefined || model === "" ? DEFAULT_MODEL : model);
}
