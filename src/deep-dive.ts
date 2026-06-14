import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ReadFileContent } from "./file-reader.js";
import { readProjectConfig, type OutputLanguage } from "./config.js";
import { createAnthropicClient } from "./anthropic-client.js";
import type { TriageCandidate } from "./triage.js";
import { REPOSITORY_CONTENT_SECURITY_RULES, formatUntrustedFileForPrompt } from "./prompt-security.js";

export type DeepDiveVerdict =
  | "confirmed_exploitable"
  | "plausible_needs_validation"
  | "not_exploitable"
  | "insufficient_context";

export type DeepDiveAnalysis = {
  triageId: string;
  relativePath: string;
  verdict: DeepDiveVerdict;
  severity: "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  title: string;
  verdictSummary: string;
  verdictReason?: string;
  attackStory: {
    preconditions: string[];
    steps: string[];
    impact: string;
    whyItWorks: string;
  };
  evidence: Array<{
    relativePath: string;
    lineHint: string;
    codeFact: string;
  }>;
  disconfirmingEvidence: string[];
  recommendedNextChecks: string[];
  shouldReport: boolean;
};

export type DeepDiveResult = {
  schemaVersion: 1;
  recordType: "scan.deep_dive";
  deepDiveVersion: 1;
  provider: "anthropic";
  model: string;
  createdAt: string;
  candidateCount: number;
  analyzedCandidateCount: number;
  analyses: DeepDiveAnalysis[];
  notes: string[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export async function runDeepDive(input: {
  cwd: string;
  files: ReadFileContent[];
  candidates: TriageCandidate[];
  maxCandidates?: number;
  forceCandidates?: boolean;
  language?: OutputLanguage;
}): Promise<DeepDiveResult | null> {
  const config = readProjectConfig(input.cwd);
  if (!config) {
    return null;
  }
  const language = input.language ?? config.outputLanguage ?? "en";

  const candidates = input.forceCandidates
    ? limitCandidates(input.candidates, input.maxCandidates)
    : selectDeepDiveCandidates(input.candidates, input.maxCandidates);

  if (candidates.length === 0) {
    return {
      schemaVersion: 1,
      recordType: "scan.deep_dive",
      deepDiveVersion: 1,
      provider: "anthropic",
      model: config.deepDiveModel,
      createdAt: new Date().toISOString(),
      candidateCount: input.candidates.length,
      analyzedCandidateCount: 0,
      analyses: [],
      notes: ["No medium-or-high triage candidates to deep dive."],
    };
  }

  const client = createAnthropicClient(config);
  const relevantFiles = selectRelevantFiles(input.files, candidates);
  const response = await client.messages.create({
    model: config.deepDiveModel,
    max_tokens: 5000,
    system: buildSystemPrompt(language),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(candidates, relevantFiles, language),
      } satisfies MessageParam,
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const parsed = parseDeepDiveJson(text);

  return {
    schemaVersion: 1,
    recordType: "scan.deep_dive",
    deepDiveVersion: 1,
    provider: "anthropic",
    model: config.deepDiveModel,
    createdAt: new Date().toISOString(),
    candidateCount: input.candidates.length,
    analyzedCandidateCount: parsed.analyses.length,
    analyses: parsed.analyses,
    notes: parsed.notes,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

export function selectDeepDiveCandidates(candidates: TriageCandidate[], maxCandidates?: number): TriageCandidate[] {
  const selected = candidates.filter((candidate) => candidate.confidence === "medium" || candidate.confidence === "high");
  return limitCandidates(selected, maxCandidates);
}

function limitCandidates(candidates: TriageCandidate[], maxCandidates?: number): TriageCandidate[] {
  return typeof maxCandidates === "number" ? candidates.slice(0, maxCandidates) : candidates;
}

function selectRelevantFiles(files: ReadFileContent[], candidates: TriageCandidate[]): ReadFileContent[] {
  const corePaths = new Set<string>();

  for (const candidate of candidates) {
    corePaths.add(candidate.relativePath);
    for (const item of candidate.evidence ?? []) {
      corePaths.add(item.relativePath);
    }
  }

  const direct = files.filter((file) => corePaths.has(file.relativePath));
  const context = files.filter((file) => isUsefulContextFile(file.relativePath));
  const merged = new Map<string, ReadFileContent>();

  for (const file of [...direct, ...context]) {
    merged.set(file.relativePath, file);
  }

  return merged.size > 0 ? Array.from(merged.values()) : files;
}

function isUsefulContextFile(relativePath: string): boolean {
  const value = relativePath.toLowerCase();
  return (
    value.endsWith("security.md") ||
    value.endsWith("readme.md") ||
    value.includes("schema") ||
    value.includes("config") ||
    value.includes("auth") ||
    value.includes("route") ||
    value.includes("controller") ||
    value.includes("middleware") ||
    value.includes("permission") ||
    value.includes("access") ||
    value.includes("tenant") ||
    value.includes("url") ||
    value.includes("fetch") ||
    value.includes("webhook")
  );
}

function buildSystemPrompt(language: OutputLanguage): string {
  return [
    "You are Carapace's deep security review model.",
    "Your job is to validate triage candidates, not to produce broad extra findings.",
    "For each candidate, decide whether the provided code supports a real attack path.",
    reasonLanguageInstruction(language, ["verdictReason"]),
    ...REPOSITORY_CONTENT_SECURITY_RULES,
    "Be strict about preconditions. If the attack requires spoofing a Firebase-verified email without code evidence, say so.",
    "For auth, authorization, tenant isolation, or impersonation candidates, first prove the attacker can enter the dangerous branch.",
    "Distinguish attacker-controlled request input from server-set state derived from verified tokens, sessions, or database records.",
    "If only an already-privileged backoffice/super-admin account can satisfy the branch condition, mark it not_exploitable unless the provided code also shows a way to create, take over, or mis-normalize that privileged identity.",
    "You must include an attacker abuse story only when there is a plausible path from the code.",
    "Do not suggest package/CVE audit findings.",
    "Return only valid JSON. No markdown.",
  ].join("\n");
}

function buildUserPrompt(candidates: TriageCandidate[], files: ReadFileContent[], language: OutputLanguage): string {
  const verdictReasonDescription =
    language === "ja"
      ? "判定の決め手になったコード上の事実を、自然で簡潔な日本語1〜2文で書く。"
      : "One or two concise English sentences explaining the decisive evidence for the verdict.";

  return `Deep dive only these triage candidates:
${JSON.stringify(candidates, null, 2)}

Return JSON with this exact shape:
{
  "analyses": [
    {
      "triageId": "triage-1",
      "relativePath": "src/auth.ts",
      "verdict": "confirmed_exploitable",
      "severity": "high",
      "confidence": "medium",
      "title": "Short title",
      "verdictSummary": "Whether the issue is truly attackable and why.",
      "verdictReason": "${verdictReasonDescription}",
      "attackStory": {
        "preconditions": ["What attacker must already have/control"],
        "steps": ["Step-by-step attacker actions, if plausible"],
        "impact": "Concrete impact",
        "whyItWorks": "Code-level reason the path works"
      },
      "evidence": [{"relativePath":"src/auth.ts","lineHint":"L90-L97","codeFact":"Specific fact"}],
      "disconfirmingEvidence": ["Facts that reduce confidence or block exploitation"],
      "recommendedNextChecks": ["Manual check or test to confirm"],
      "shouldReport": true
    }
  ],
  "notes": ["brief note"]
}

Verdict rules:
- confirmed_exploitable: code shows a realistic attack path with reasonable preconditions.
- plausible_needs_validation: looks risky, but needs runtime/config/manual validation.
- not_exploitable: code has a guard that blocks the attack.
- insufficient_context: cannot decide from provided files.
- For each analysis, include verdictReason ${reasonFieldLanguagePhrase(language)}. Keep it to 1-2 concise sentences and explain the decisive fact that made the candidate exploitable, not exploitable, or still uncertain.

Files:
${files.map(formatUntrustedFileForPrompt).join("\n\n")}`;
}

function reasonLanguageInstruction(language: OutputLanguage, fields: string[]): string {
  const fieldList = fields.join(" and ");
  if (language === "ja") {
    return `Use natural, concise Japanese only for the values of ${fieldList}. Keep JSON keys, enum values, ids, paths, and code symbols unchanged; do not translate identifiers or code facts.`;
  }

  return `Write ${fieldList} in concise English. Keep JSON keys, enum values, ids, paths, and code symbols unchanged.`;
}

function reasonFieldLanguagePhrase(language: OutputLanguage): string {
  return language === "ja" ? "in natural, concise Japanese" : "in English";
}

function parseDeepDiveJson(text: string): { analyses: DeepDiveAnalysis[]; notes: string[] } {
  const parsed = JSON.parse(stripJsonFence(text)) as {
    analyses?: DeepDiveAnalysis[];
    notes?: string[];
  };

  return {
    analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
