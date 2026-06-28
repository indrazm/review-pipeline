import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify, type TomlTable } from "smol-toml";

export const PROVIDER_TYPES = [
  "openai-compatible",
  "anthropic-compatible",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

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

const CONFIG_DIRECTORY_NAME = ".review-this";
const CONFIG_FILE_NAME = "config.toml";

export function getProviderConfigDirectory(): string {
  return join(homedir(), CONFIG_DIRECTORY_NAME);
}

export function getProviderConfigPath(): string {
  return join(getProviderConfigDirectory(), CONFIG_FILE_NAME);
}

export function readProviderConfigStatus(): ProviderConfigStatus {
  try {
    return {
      config: parseProviderConfig(
        parse(readFileSync(getProviderConfigPath(), "utf8")),
      ),
      status: "valid",
    };
  } catch (error: unknown) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return { status: "missing" };
    }

    return {
      error: error instanceof Error ? error.message : String(error),
      status: "invalid",
    };
  }
}

export function loadProviderConfig(): ProviderConfig {
  const configStatus = readProviderConfigStatus();

  if (configStatus.status === "valid") {
    return configStatus.config;
  }

  if (configStatus.status === "missing") {
    throw new Error("Provider is not connected. Choose Connect provider first.");
  }

  throw new Error(
    `Provider config at ${getProviderConfigPath()} is invalid: ${configStatus.error}`,
  );
}

export function saveProviderConfig(config: ProviderConfig): void {
  assertValidProviderConfig(config);

  const configDirectory = getProviderConfigDirectory();
  const configPath = getProviderConfigPath();

  mkdirSync(configDirectory, { mode: 0o700, recursive: true });
  chmodSync(configDirectory, 0o700);
  writeFileSync(
    configPath,
    `${stringify({
      provider: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        type: config.type,
      },
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  chmodSync(configPath, 0o600);
}

export function assertValidProviderConfig(config: ProviderConfig): void {
  if (!isProviderType(config.type)) {
    throw new Error("Provider type must be openai-compatible or anthropic-compatible.");
  }

  assertNonEmptyString(config.baseUrl, "Base URL");
  assertNonEmptyString(config.apiKey, "API key");
  assertNonEmptyString(config.model, "Model");
  assertHttpUrl(config.baseUrl);
}

export function parseProviderConfig(value: unknown): ProviderConfig {
  const root = assertTomlTable(value, "Config");
  const provider = assertTomlTable(root.provider, "Provider config");
  const providerType = assertString(provider.type, "Provider type");

  if (!isProviderType(providerType)) {
    throw new Error("Provider type must be openai-compatible or anthropic-compatible.");
  }

  const config = {
    apiKey: assertString(provider.apiKey, "Provider API key"),
    baseUrl: assertString(provider.baseUrl, "Provider base URL"),
    model: assertString(provider.model, "Provider model"),
    type: providerType,
  };

  assertValidProviderConfig(config);

  return config;
}

export function isProviderType(value: string): value is ProviderType {
  return PROVIDER_TYPES.includes(value as ProviderType);
}

function assertTomlTable(value: unknown, label: string): TomlTable {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be a TOML table.`);
  }

  return value as TomlTable;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}

function assertHttpUrl(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Base URL must be an absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must use http or https.");
  }
}

function isNodeErrorWithCode(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
