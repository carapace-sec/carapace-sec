export const MODEL_SELECTION_FEATURE_TIER = "free" as const;

export const TRIAGE_MODEL_PRESETS = {
  haiku: {
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    costProfile: "lowest",
    description: "Default fast triage model for broad first-pass scans.",
  },
  sonnet: {
    model: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    costProfile: "balanced",
    description: "Optional stronger triage model when users want fewer missed candidates.",
  },
} as const;

export const DEFAULT_TRIAGE_MODEL_PRESET: TriageModelPresetName = "haiku";

export const DEEP_DIVE_MODEL_PRESETS = {
  opus: {
    model: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    costProfile: "highest",
    description: "Fixed deep-dive model for exploitability validation and attack stories.",
  },
} as const;

export const FIXED_DEEP_DIVE_MODEL_PRESET: DeepDiveModelPresetName = "opus";

export const CARAPACE_MODELS = {
  triage: TRIAGE_MODEL_PRESETS[DEFAULT_TRIAGE_MODEL_PRESET].model,
  deepDive: DEEP_DIVE_MODEL_PRESETS[FIXED_DEEP_DIVE_MODEL_PRESET].model,
} as const;

export type TriageModelPresetName = keyof typeof TRIAGE_MODEL_PRESETS;
export type DeepDiveModelPresetName = keyof typeof DEEP_DIVE_MODEL_PRESETS;
export type CarapaceModelRole = keyof typeof CARAPACE_MODELS;

export function isTriageModelPresetName(value: string): value is TriageModelPresetName {
  return value in TRIAGE_MODEL_PRESETS;
}

export function resolveTriageModelPreset(preset: TriageModelPresetName): string {
  return TRIAGE_MODEL_PRESETS[preset].model;
}

export function findTriageModelPresetByModel(model: string): TriageModelPresetName | null {
  const entries = Object.entries(TRIAGE_MODEL_PRESETS) as Array<
    [TriageModelPresetName, (typeof TRIAGE_MODEL_PRESETS)[TriageModelPresetName]]
  >;
  return entries.find(([, preset]) => preset.model === model)?.[0] ?? null;
}

export function resolveFixedDeepDiveModel(): string {
  return DEEP_DIVE_MODEL_PRESETS[FIXED_DEEP_DIVE_MODEL_PRESET].model;
}
