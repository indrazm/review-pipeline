export type ProviderType = "openai-compatible" | "anthropic-compatible";

export type ProviderConfig = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly type: ProviderType;
};

export type ProviderConfigStatus =
  | {
      readonly status: "missing";
    }
  | {
      readonly config: ProviderConfig;
      readonly status: "valid";
    }
  | {
      readonly error: string;
      readonly status: "invalid";
    };

