import Anthropic from "@anthropic-ai/sdk";
import type { CarapaceConfig } from "./config.js";
import { resolveConfiguredApiKey } from "./config.js";
import { readEncryptedApiKey } from "./secrets.js";

export function createAnthropicClient(config: CarapaceConfig): Anthropic {
  const apiKey = getConfiguredApiKey(config);
  if (!apiKey) {
    throw new Error("Carapace is initialized, but the configured API key source is unavailable.");
  }

  return new Anthropic({
    apiKey,
    maxRetries: 1,
    timeout: 180_000,
  });
}

function getConfiguredApiKey(config: CarapaceConfig): string | null {
  if (config.apiKeySource.type === "windows-secure-string") {
    return readEncryptedApiKey(config.apiKeySource.credentialFile);
  }

  return resolveConfiguredApiKey(config);
}
