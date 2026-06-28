import { loadProviderConfig } from "../provider/providerConfig.js";
import { createCompletionModelFromProviderConfig } from "../provider/providerModel.js";

export const AGENT_MAX_TURNS = 75;

export function createCompletionModel() {
  return createCompletionModelFromProviderConfig(loadProviderConfig());
}
