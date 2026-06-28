import type { CompletionModel } from "@anvia/core";
import {
  createCompletionModelFromProviderConfig,
  loadProviderConfig,
} from "../provider/service.js";

export const AGENT_MAX_TURNS = 75;

export function createCompletionModel(): CompletionModel {
  return createCompletionModelFromProviderConfig(loadProviderConfig());
}

