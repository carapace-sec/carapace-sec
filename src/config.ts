import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_TRIAGE_MODEL_PRESET,
  findTriageModelPresetByModel,
  isTriageModelPresetName,
  resolveFixedDeepDiveModel,
  resolveTriageModelPreset,
  type TriageModelPresetName,
} from "./model-registry.js";

export const DEFAULT_API_KEY_ENV_VAR = "ANTHROPIC_API_KEY";
export type OutputLanguage = "ja" | "en";

export type ApiKeySource =
  | {
      type: "env";
      envVar: string;
    }
  | {
      type: "windows-secure-string";
      credentialFile: string;
    };

export type CarapaceConfig = {
  schemaVersion: 1;
  provider: "anthropic";
  apiKeySource: ApiKeySource;
  triageModelPreset: TriageModelPresetName;
  triageModel: string;
  deepDiveModel: string;
  outputLanguage?: OutputLanguage;
  createdAt: string;
  updatedAt: string;
};

export function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, ".carapace", "config.json");
}

export function getUserCredentialPath(): string {
  return path.join(os.homedir(), ".carapace", "credentials", "anthropic-api-key.json");
}

export function createConfig(input: {
  cwd: string;
  apiKeySource: ApiKeySource;
  triageModelPreset?: TriageModelPresetName;
  triageModel?: string;
  outputLanguage?: OutputLanguage;
}): CarapaceConfig {
  const now = new Date().toISOString();
  const triageModelPreset =
    input.triageModelPreset ??
    (input.triageModel ? findTriageModelPresetByModel(input.triageModel) : null) ??
    DEFAULT_TRIAGE_MODEL_PRESET;
  return {
    schemaVersion: 1,
    provider: "anthropic",
    apiKeySource: input.apiKeySource,
    triageModelPreset,
    triageModel: input.triageModel ?? resolveTriageModelPreset(triageModelPreset),
    deepDiveModel: resolveFixedDeepDiveModel(),
    ...(input.outputLanguage ? { outputLanguage: input.outputLanguage } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function writeProjectConfig(cwd: string, config: CarapaceConfig): string {
  const configPath = getProjectConfigPath(cwd);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return configPath;
}

export function readProjectConfig(cwd: string): CarapaceConfig | null {
  const configPath = getProjectConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<CarapaceConfig>;
  const normalizedTriage = normalizeTriageModelConfig(config);
  return {
    schemaVersion: 1,
    provider: "anthropic",
    apiKeySource: config.apiKeySource as ApiKeySource,
    triageModelPreset: normalizedTriage.preset,
    triageModel: normalizedTriage.model,
    deepDiveModel: resolveFixedDeepDiveModel(),
    ...(isOutputLanguage(config.outputLanguage) ? { outputLanguage: config.outputLanguage } : {}),
    createdAt: config.createdAt ?? new Date(0).toISOString(),
    updatedAt: config.updatedAt ?? new Date(0).toISOString(),
  };
}

export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return value === "ja" || value === "en";
}

function normalizeTriageModelConfig(config: Partial<CarapaceConfig>): {
  preset: TriageModelPresetName;
  model: string;
} {
  if (config.triageModelPreset && isTriageModelPresetName(config.triageModelPreset)) {
    return {
      preset: config.triageModelPreset,
      model: resolveTriageModelPreset(config.triageModelPreset),
    };
  }

  if (config.triageModel) {
    return {
      preset: findTriageModelPresetByModel(config.triageModel) ?? DEFAULT_TRIAGE_MODEL_PRESET,
      model: config.triageModel,
    };
  }

  return {
    preset: DEFAULT_TRIAGE_MODEL_PRESET,
    model: resolveTriageModelPreset(DEFAULT_TRIAGE_MODEL_PRESET),
  };
}

export function findApiKeyEnvVar(preferredEnvVar = DEFAULT_API_KEY_ENV_VAR): string | null {
  if (process.env[preferredEnvVar]) {
    return preferredEnvVar;
  }

  if (preferredEnvVar !== "CARAPACE_ANTHROPIC_API_KEY" && process.env.CARAPACE_ANTHROPIC_API_KEY) {
    return "CARAPACE_ANTHROPIC_API_KEY";
  }

  if (preferredEnvVar !== DEFAULT_API_KEY_ENV_VAR && process.env[DEFAULT_API_KEY_ENV_VAR]) {
    return DEFAULT_API_KEY_ENV_VAR;
  }

  return null;
}

export function resolveConfiguredApiKey(config: CarapaceConfig): string | null {
  if (config.apiKeySource.type === "env") {
    return process.env[config.apiKeySource.envVar] || null;
  }

  return null;
}
