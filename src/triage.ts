import { readProjectConfig, type OutputLanguage } from "./config.js";
import { createAnthropicClient } from "./anthropic-client.js";
import type { ReadFileContent } from "./file-reader.js";
import { CARAPACE_SELF_PROFILE, DEFAULT_SCAN_PROFILE, readLocalScanProfile, type ScanProfile } from "./file-collector.js";
import { resolveTriageModelPreset, type TriageModelPresetName } from "./model-registry.js";
import { REPOSITORY_CONTENT_SECURITY_RULES, formatUntrustedFileForPrompt } from "./prompt-security.js";

export type TriageCandidate = {
  id: string;
  relativePath: string;
  riskArea:
    | "auth"
    | "tenant_isolation"
    | "impersonation"
    | "public_route"
    | "input_validation"
    | "webhook_signature"
    | "external_notification"
    | "ssrf"
    | "data_exposure"
    | "denial_of_service"
    | "replay"
    | "other";
  title: string;
  whySuspicious: string;
  severityReason?: string;
  manualDeepDiveRecommended?: boolean;
  manualDeepDiveReason?: string;
  evidence: Array<{
    relativePath: string;
    lineHint: string;
    symbol?: string;
  }>;
  needsDeepDive: boolean;
  confidence: "low" | "medium" | "high";
};

export type TriageResult = {
  schemaVersion: 1;
  recordType: "scan.triage";
  triageVersion: 1;
  provider: "anthropic";
  modelPreset?: TriageModelPresetName;
  model: string;
  createdAt: string;
  candidateCount: number;
  candidates: TriageCandidate[];
  notes: string[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export async function runTriage(input: {
  cwd: string;
  files: ReadFileContent[];
  profile: ScanProfile;
  triageModelPreset?: TriageModelPresetName;
  language?: OutputLanguage;
}): Promise<TriageResult | null> {
  const config = readProjectConfig(input.cwd);
  if (!config) {
    return null;
  }

  const client = createAnthropicClient(config);
  const modelPreset = input.triageModelPreset ?? config.triageModelPreset;
  const model = input.triageModelPreset ? resolveTriageModelPreset(input.triageModelPreset) : config.triageModel;
  const language = input.language ?? config.outputLanguage ?? "en";

  const response = await client.messages.create({
    model,
    max_tokens: 3200,
    temperature: 0,
    system: buildSystemPrompt(language),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(input.files, input.profile, language, input.cwd),
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const parsed = parseTriageJson(text);
  return {
    schemaVersion: 1,
    recordType: "scan.triage",
    triageVersion: 1,
    provider: "anthropic",
    modelPreset,
    model,
    createdAt: new Date().toISOString(),
    candidateCount: parsed.candidates.length,
    candidates: parsed.candidates,
    notes: parsed.notes,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function buildSystemPrompt(language: OutputLanguage): string {
  return [
    "You are Carapace's first-pass security triage model.",
    "Your job is only to shortlist suspicious areas for later deep analysis.",
    "Do not produce final vulnerability reports.",
    "Do not claim a vulnerability is real unless the code clearly supports it.",
    reasonLanguageInstruction(language, ["severityReason", "manualDeepDiveReason"]),
    ...REPOSITORY_CONTENT_SECURITY_RULES,
    "Prefer auth, authorization, tenant isolation, impersonation, public route, and user input risks.",
    "For auth/authorization/impersonation candidates, do not rate a branch medium/high merely because it exists.",
    "Only rate it medium/high when the code suggests an unprivileged attacker can enter that branch through request input, account creation, identity takeover, or identity normalization flaws.",
    "If the branch depends only on server-set state from verified tokens, sessions, or database records, keep it low or omit it.",
    "Do not use hypothetical verified-email spoofing, Firebase token forgery, or already-compromised backoffice accounts as medium/high evidence unless the provided code shows that path.",
    "Ignore known-CVE/package-audit style findings.",
    "Return only valid JSON. No markdown.",
  ].join("\n");
}

function buildUserPrompt(files: ReadFileContent[], profile: ScanProfile, language: OutputLanguage, cwd: string): string {
  const focus = focusForProfile(profile, cwd);
  const severityReasonDescription =
    language === "ja"
      ? "この候補をlow/medium/highと判断した決め手を、自然で簡潔な日本語1文で書く。"
      : "One concise English sentence explaining why this candidate is low, medium, or high confidence.";
  const manualDeepDiveReasonDescription =
    language === "ja"
      ? "low候補を任意deep-dive推奨にする/しない理由を、自然で簡潔な日本語1文で書く。"
      : "One concise English sentence explaining whether a low candidate deserves optional manual deep-dive.";

  return `${focus}

Return JSON with this exact shape:
{
  "candidates": [
    {
      "id": "triage-1",
      "relativePath": "src/auth.ts",
      "riskArea": "auth",
      "title": "Short title",
      "whySuspicious": "Why this deserves deeper analysis, not a final claim.",
      "severityReason": "${severityReasonDescription}",
      "manualDeepDiveRecommended": false,
      "manualDeepDiveReason": "${manualDeepDiveReasonDescription}",
      "evidence": [{"relativePath":"src/auth.ts","lineHint":"L10-L20","symbol":"functionName"}],
      "needsDeepDive": true,
      "confidence": "low"
    }
  ],
  "notes": ["brief note"]
}

Rules:
- Return at most 5 candidates.
- Use confidence "low" unless the code strongly supports the concern.
- Follow profile-specific confidence rules when the current profile states that a concrete pattern is medium/high under validated product context. Do not downgrade that pattern merely because the attacker is an authenticated normal business user if the profile says that role is attacker-controlled.
- For each candidate, include severityReason ${reasonFieldLanguagePhrase(language)}. Keep it to 1 concise sentence, or 2 very short sentences if needed. Explain why the confidence is low, medium, or high.
- For low-confidence candidates, set manualDeepDiveRecommended to true only when it is a stronger-than-usual low: reachable from normal user/default behavior, not heavily configuration-dependent, and similar to a confirmed real pattern such as external URL/redirect SSRF, tenant isolation, or auth bypass.
- Set manualDeepDiveRecommended to false for lows that depend on disabled features, special operator configuration, already-compromised/rare preconditions, dead code, hygiene-only concerns, or cases where a later guard clearly validates the risky input.
- Include manualDeepDiveReason ${reasonFieldLanguagePhrase(language)} for every low-confidence candidate. Keep it to 1 concise sentence. For medium/high candidates, set manualDeepDiveRecommended to false.
- manualDeepDiveRecommended is not a reason to raise confidence. If a candidate has a normal-user path and resembles a real pattern but one important code/runtime fact remains uncertain, keep confidence "low" and use manualDeepDiveRecommended instead of upgrading it to "medium".
- Use confidence "medium" or "high" only when the provided code already supports a complete attack path without needing optional manual validation.
- Be selective with manualDeepDiveRecommended. Return true for at most 2 low candidates per scan, and 0 is acceptable.
- Do not mark a low as manualDeepDiveRecommended when its main uncertainty is production configuration, proxy policy, timeout values, disk limits, optional download/archive tooling, or general resource-exhaustion tuning.
- Use riskArea values from this set only: auth, tenant_isolation, impersonation, public_route, input_validation, webhook_signature, external_notification, ssrf, data_exposure, denial_of_service, replay, other.
- For auth/authorization/impersonation, "strongly supports" means the code shows how an attacker can satisfy the dangerous branch condition.
- A backoffice/super-admin-only branch is not medium/high by itself; look for a path to create, take over, spoof, or mis-normalize that privileged identity.
- Phrases like "if the attacker can spoof the verified email" or "if the backoffice account is compromised" are not enough for medium/high unless this code shows how.
- Include no final exploit story yet; that belongs to the next deep-dive stage.
- Stay within the current profile: ${profile}.
- If nothing deserves deeper analysis, return {"candidates":[],"notes":["no triage candidates"]}.

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

function focusForProfile(profile: ScanProfile, cwd: string): string {
  const localFocus = readLocalScanProfile(cwd, profile)?.focus;
  if (localFocus) {
    return localFocus;
  }

  if (profile === CARAPACE_SELF_PROFILE) {
    return [
      "Triage this Carapace CLI self-defense slice before public release.",
      "Prioritize only: repository-controlled file paths/content escaping the scan root, symlink/junction bypasses, unbounded file reads, prompt injection through code comments/README strings, JSON output corruption, stored API key exposure, unsafe child-process use, record-file path traversal, and any path where scanned repository content can trigger network fetches or command execution.",
      "Do not treat the configured Anthropic SDK model call as SSRF by itself; it is the intended model API call using the user's own API key.",
      "Medium/high requires clear code evidence that untrusted repository content, command-line input, or a recorded run file can cross a trust boundary into file reads outside the scan root, secret exposure, prompt instruction following, network fetches beyond the model API, or command execution.",
      "Be conservative: hygiene issues, missing tests, or hypothetical malicious local users are low unless the code shows a realistic public-use attack path.",
    ].join(" ");
  }

  if (profile === DEFAULT_SCAN_PROFILE) {
    return [
      "Triage this auto-selected security slice from a repository.",
      "Prioritize auth, authorization, tenant isolation, impersonation, public routes, webhook/signature checks, user-controlled URLs, server-side fetches, uploads, parsing, and data exposure.",
      "Treat normal authenticated product users as possible attackers when the code lets them control inputs that cross a trust boundary; do not downgrade a finding merely because the attacker needs an ordinary account.",
      "For server-side URL fetches, check scheme restrictions, hostname validation, private/loopback/link-local IP blocking, DNS resolution, redirect revalidation, proxy behavior, response size limits, and timeout behavior.",
      "Use medium/high only when the provided code supports a complete attack path. Use low plus manualDeepDiveRecommended for plausible normal-user paths where one runtime fact still needs validation.",
    ].join(" ");
  }

  return [
    "Triage this local profile security slice.",
    "Prioritize the trust boundaries implied by the selected files.",
    "Treat normal authenticated product users as possible attackers when they can control relevant input.",
    "For server-side URL fetches, check DNS, private IP, link-local, redirect, proxy, size, and timeout controls.",
    "Be conservative: medium/high requires clear code evidence and a plausible attacker path.",
  ].join(" ");
}

function parseTriageJson(text: string): { candidates: TriageCandidate[]; notes: string[] } {
  const parsed = JSON.parse(stripJsonFence(text)) as {
    candidates?: TriageCandidate[];
    notes?: string[];
  };

  return {
    candidates: Array.isArray(parsed.candidates) ? normalizeCandidates(parsed.candidates.slice(0, 5)) : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  };
}

function normalizeCandidates(candidates: TriageCandidate[]): TriageCandidate[] {
  let recommendedCount = 0;
  return candidates.map((candidate) => {
    const normalized = normalizeCandidate(candidate);
    if (normalized.manualDeepDiveRecommended) {
      recommendedCount += 1;
      if (recommendedCount > 2) {
        return {
          ...normalized,
          manualDeepDiveRecommended: false,
        };
      }
    }

    return normalized;
  });
}

function normalizeCandidate(candidate: TriageCandidate): TriageCandidate {
  if (candidate.confidence !== "low") {
    return {
      ...candidate,
      manualDeepDiveRecommended: false,
    };
  }

  return {
    ...candidate,
    manualDeepDiveRecommended:
      candidate.manualDeepDiveRecommended === true && isAllowedManualDeepDiveRecommendation(candidate),
  };
}

function isAllowedManualDeepDiveRecommendation(candidate: TriageCandidate): boolean {
  const text = [
    candidate.title,
    candidate.whySuspicious,
    candidate.severityReason,
    candidate.manualDeepDiveReason,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const blockedSignals = [
    "proxy context",
    "proxy-context",
    "proxy configuration",
    "behind a proxy",
    "yt-dlp",
    "monolith",
    "archive subprocess",
    "timeout",
    "disk",
    "disabled",
    "optional",
    "old execution",
    "legacy",
    "guess",
    "suffix",
    "waiting execution",
    "プロキシ",
    "設定依存",
    "タイムアウト",
    "ディスク",
    "無効",
    "特殊な前提",
    "古い",
    "レガシー",
    "推測",
    "サフィックス",
  ];

  return !blockedSignals.some((signal) => text.includes(signal));
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
