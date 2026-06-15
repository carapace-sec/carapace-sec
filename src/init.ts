import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createConfig,
  DEFAULT_API_KEY_ENV_VAR,
  findApiKeyEnvVar,
  getUserCredentialPath,
  isOutputLanguage,
  readProjectConfig,
  type OutputLanguage,
  writeProjectConfig,
} from "./config.js";
import {
  CARAPACE_MODELS,
  DEFAULT_TRIAGE_MODEL_PRESET,
  isTriageModelPresetName,
  resolveTriageModelPreset,
  type TriageModelPresetName,
} from "./model-registry.js";
import { getInitMessages, resolveOutputLanguage, type InitMessages } from "./messages.js";
import { canUseWindowsSecureString, writeEncryptedApiKey } from "./secrets.js";

export async function runInit(argv: string[], cwd: string): Promise<number> {
  let apiKeyEnv: string;
  let triageModelPreset: TriageModelPresetName;
  let outputLanguage: OutputLanguage | undefined;
  const existingConfig = readProjectConfig(cwd);
  let messages = getInitMessages(resolveOutputLanguage({ configured: existingConfig?.outputLanguage }));
  try {
    apiKeyEnv = readOption(argv, "--api-key-env") ?? DEFAULT_API_KEY_ENV_VAR;
    triageModelPreset = readTriageModelPreset(argv);
    outputLanguage = readLanguageOption(argv) ?? existingConfig?.outputLanguage;
    messages = getInitMessages(
      resolveOutputLanguage({
        explicit: outputLanguage,
        configured: existingConfig?.outputLanguage,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(messages.prefix(message));
    return 1;
  }
  const triageModel = resolveTriageModelPreset(triageModelPreset);
  const envVarWithKey = findApiKeyEnvVar(apiKeyEnv);

  if (envVarWithKey) {
    const configPath = writeProjectConfig(
      cwd,
      createConfig({
        cwd,
        apiKeySource: {
          type: "env",
          envVar: envVarWithKey,
        },
        triageModelPreset,
        outputLanguage,
      }),
    );
    printSavedConfig(messages, configPath, triageModelPreset, triageModel, outputLanguage);
    console.log(messages.apiKeySourceEnv(envVarWithKey));
    return 0;
  }

  if (!process.stdin.isTTY) {
    console.error(messages.noApiKeyFound(apiKeyEnv));
    console.error(messages.interactiveOrEnv());
    return 1;
  }

  if (!canUseWindowsSecureString()) {
    console.error(messages.noApiKeyFound(apiKeyEnv));
    console.error(messages.windowsOnlyStorage());
    console.error(messages.setApiKeyAndRetry());
    return 1;
  }

  for (const line of messages.apiKeySetupGuide()) {
    console.log(line);
  }
  console.log("");

  const apiKey = await promptForSecret(messages.apiKeyPrompt());
  if (!apiKey.trim()) {
    console.error(messages.emptyApiKey());
    return 1;
  }

  const credentialPath = getUserCredentialPath();
  writeEncryptedApiKey(credentialPath, apiKey.trim());
  const configPath = writeProjectConfig(
    cwd,
    createConfig({
      cwd,
      apiKeySource: {
        type: "windows-secure-string",
        credentialFile: credentialPath,
      },
      triageModelPreset,
      outputLanguage,
    }),
  );

  console.log("");
  printSavedConfig(messages, configPath, triageModelPreset, triageModel, outputLanguage);
  console.log(messages.encryptedCredentialSaved(credentialPath));
  return 0;
}

function printSavedConfig(
  messages: InitMessages,
  configPath: string,
  triageModelPreset: TriageModelPresetName,
  triageModel: string,
  outputLanguage: OutputLanguage | undefined,
): void {
  console.log(messages.configSaved(configPath));
  console.log(messages.triageModel(triageModelPreset, triageModel));
  console.log(messages.deepDiveModel(CARAPACE_MODELS.deepDive));
  if (outputLanguage) {
    console.log(messages.outputLanguage(outputLanguage));
  }
}

function readTriageModelPreset(argv: string[]): TriageModelPresetName {
  const raw = readOption(argv, "--triage-model");
  if (!raw) {
    return DEFAULT_TRIAGE_MODEL_PRESET;
  }

  if (isTriageModelPresetName(raw)) {
    return raw;
  }

  throw new Error(`Unknown --triage-model value: ${raw}. Use haiku or sonnet.`);
}

function readLanguageOption(argv: string[]): OutputLanguage | undefined {
  const raw = readOption(argv, "--lang");
  if (!raw) {
    return undefined;
  }

  if (isOutputLanguage(raw)) {
    return raw;
  }

  throw new Error(`Unknown --lang value: ${raw}. Use ja or en.`);
}

function readOption(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

async function promptForSecret(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input, output, terminal: true });
  const mutableRl = rl as readline.Interface & {
    _writeToOutput?: (value: string) => void;
  };
  const originalWrite = mutableRl._writeToOutput?.bind(rl);
  mutableRl._writeToOutput = (value: string) => {
    if (value.includes(prompt)) {
      originalWrite?.(value);
      return;
    }
    originalWrite?.("*");
  };

  try {
    return await rl.question(prompt);
  } finally {
    mutableRl._writeToOutput = originalWrite;
    rl.close();
  }
}
