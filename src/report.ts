import path from "node:path";
import process from "node:process";
import { isOutputLanguage, readProjectConfig, type OutputLanguage } from "./config.js";
import type { DeepDiveAnalysis, DeepDiveResult } from "./deep-dive.js";
import { getReportMessages, resolveOutputLanguage, type ReportMessages } from "./messages.js";
import { readJsonlFile, type HumanValidationRecord, type ScanRunRecord } from "./records.js";
import { resolveRunFile } from "./run-files.js";

type ReportableConcern = {
  analysis: DeepDiveAnalysis;
  validation?: HumanValidationRecord["validatedConcerns"][number];
};

type LoadedRun = {
  runFilePath: string;
  run?: ScanRunRecord;
  deepDives: DeepDiveResult[];
  validation?: HumanValidationRecord;
};

export function runReport(argv: string[], cwd: string): number {
  const options = readReportOptions(argv, cwd);
  const messages = getReportMessages(options.language);
  const runFilePath = resolveRunFile(cwd, options.target);
  const loaded = loadRun(runFilePath, messages);
  const output = formatReport(loaded, shouldUseColor(), messages);

  console.log(output);
  return 0;
}

function readReportOptions(
  argv: string[],
  cwd: string,
): {
  target?: string;
  language: OutputLanguage;
} {
  let target: string | undefined;
  let explicitLanguage: OutputLanguage | undefined;

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--lang") {
      const raw = argv[index + 1];
      if (!raw || raw.startsWith("--")) {
        throw new Error("Missing value for --lang.");
      }
      if (!isOutputLanguage(raw)) {
        throw new Error(`Unknown --lang value: ${raw}. Use ja or en.`);
      }
      explicitLanguage = raw;
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown report option: ${value}`);
    }

    if (target) {
      throw new Error(`Unexpected extra report argument: ${value}`);
    }
    target = value;
  }

  return {
    target,
    language: resolveOutputLanguage({
      explicit: explicitLanguage,
      configured: readProjectConfig(cwd)?.outputLanguage,
    }),
  };
}

function loadRun(runFilePath: string, messages: ReportMessages): LoadedRun {
  const records = readJsonlFile(runFilePath);
  const run = records.find(isScanRunRecord);
  const deepDives = records.filter(isDeepDiveResult);
  const validation = records.filter(isHumanValidationRecord).at(-1);

  if (deepDives.length === 0) {
    throw new Error(messages.noDeepDiveRecord(runFilePath));
  }

  return {
    runFilePath,
    run,
    deepDives,
    validation,
  };
}

function formatReport(loaded: LoadedRun, useColor: boolean, messages: ReportMessages): string {
  const concerns = collectReportableConcerns(loaded.deepDives, loaded.validation);
  if (concerns.length === 0) {
    return messages.noReportableConcerns(loaded.runFilePath);
  }

  const primary = selectPrimaryConcern(concerns);
  const related = concerns.filter((concern) => concern !== primary);
  const profile = loaded.run?.scope.profile ?? "unknown";
  const runId = loaded.run?.runId ?? path.basename(loaded.runFilePath, ".jsonl");

  return [
    [
      `${paintSeverity(primary.analysis.severity, useColor)} ${primary.analysis.title}`,
      messages.run(runId),
      messages.profile(profile),
    ].join("\n"),
    section(messages.summaryTitle(), [primary.analysis.verdictSummary, validationReason(primary, messages)]),
    section(messages.impactTitle(), [primary.analysis.attackStory.impact]),
    listSection(messages.attackPrerequisitesTitle(), preconditionLines(primary, messages)),
    numberedSection(messages.attackStoryTitle(), primary.analysis.attackStory.steps),
    evidenceSection(primary.analysis.evidence, messages),
    listSection(messages.disconfirmingEvidenceTitle(), disconfirmingLines(primary, messages)),
    listSection(messages.recommendedFixesTitle(), recommendedFixes(primary.analysis, messages)),
    section(messages.verdictTitle(), verdictLines(primary)),
    relatedSection(related, useColor, messages),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function collectReportableConcerns(
  deepDives: DeepDiveResult[],
  validation: HumanValidationRecord | undefined,
): ReportableConcern[] {
  const analysesByTriageId = new Map<string, DeepDiveAnalysis>();
  for (const deepDive of deepDives) {
    for (const analysis of deepDive.analyses) {
      analysesByTriageId.set(analysis.triageId, analysis);
    }
  }

  return Array.from(analysesByTriageId.values())
    .filter((analysis) => analysis.shouldReport)
    .map((analysis) => ({
      analysis,
      validation: validation?.validatedConcerns.find((concern) => concern.triageId === analysis.triageId),
    }));
}

function selectPrimaryConcern(concerns: ReportableConcern[]): ReportableConcern {
  const validatedPrimary = concerns.find((concern) => concern.validation?.humanVerdict === "real_concern");
  if (validatedPrimary) {
    return validatedPrimary;
  }

  return concerns
    .slice()
    .sort((a, b) => severityRank(b.analysis.severity) - severityRank(a.analysis.severity))[0];
}

function section(title: string, lines: string[]): string {
  const body = lines.filter((line) => line.trim().length > 0).join("\n");
  return body.length > 0 ? `${sectionHeader(title)}\n${body}` : "";
}

function listSection(title: string, items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  return `${sectionHeader(title)}\n${items.map((item) => `  - ${item}`).join("\n")}`;
}

function numberedSection(title: string, items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  return `${sectionHeader(title)}\n${items.map((item, index) => `  ${index + 1}. ${item}`).join("\n")}`;
}

function sectionHeader(title: string): string {
  return `${title}\n${"-".repeat(Math.max(4, title.length))}`;
}

function evidenceSection(evidence: DeepDiveAnalysis["evidence"], messages: ReportMessages): string {
  if (evidence.length === 0) {
    return "";
  }

  return `${sectionHeader(messages.codeEvidenceTitle())}\n${evidence
    .map((item) => `  - ${item.relativePath} ${item.lineHint}: ${item.codeFact}`)
    .join("\n")}`;
}

function relatedSection(concerns: ReportableConcern[], useColor: boolean, messages: ReportMessages): string {
  if (concerns.length === 0) {
    return "";
  }

  return [
    sectionHeader(messages.relatedConcernsTitle()),
    ...concerns.map((concern) =>
      [
        `${paintSeverity(concern.analysis.severity, useColor)} ${concern.analysis.title}`,
        messages.relatedSummary(concern.analysis.verdictSummary),
        messages.relatedImpact(concern.analysis.attackStory.impact),
        messages.relatedVerdict(
          concern.analysis.shouldReport,
          concern.analysis.verdict,
          concern.analysis.confidence,
        ),
      ].join("\n"),
    ),
  ].join("\n\n");
}

function validationReason(concern: ReportableConcern, messages: ReportMessages): string {
  if (!concern.validation) {
    return "";
  }

  return messages.humanValidation(concern.validation.reason);
}

function preconditionLines(concern: ReportableConcern, messages: ReportMessages): string[] {
  const lines = concern.analysis.attackStory.preconditions.filter(
    (item) => !item.toLowerCase().includes("attacker can set or modify the relevant external input"),
  );

  if (!concern.validation) {
    return concern.analysis.attackStory.preconditions;
  }

  return [
    messages.validatedAuthenticatedInputPrecondition(concern.validation.operationalContext),
    ...lines,
  ];
}

function disconfirmingLines(concern: ReportableConcern, messages: ReportMessages): string[] {
  if (!concern.validation) {
    return concern.analysis.disconfirmingEvidence;
  }

  return [
    messages.validatedAuthenticatedInputLimit(),
    ...concern.analysis.disconfirmingEvidence.filter(
      (item) =>
        !item.toLowerCase().includes("setting the relevant external input requires") &&
        !item.toLowerCase().includes("requires a feature-specific authenticated role"),
    ),
  ];
}

function recommendedFixes(analysis: DeepDiveAnalysis, messages: ReportMessages): string[] {
  if (looksLikeExternalUrlSsrf(analysis)) {
    return messages.recommendedExternalUrlSsrfFixes();
  }

  if (looksLikeResourceExhaustion(analysis)) {
    return messages.recommendedResourceExhaustionFixes();
  }

  return analysis.recommendedNextChecks;
}

function looksLikeExternalUrlSsrf(analysis: DeepDiveAnalysis): boolean {
  const text = analysisSearchText(analysis);
  return (
    text.includes("ssrf") ||
    text.includes("169.254") ||
    text.includes("metadata") ||
    text.includes("internal url") ||
    text.includes("private ip") ||
    text.includes("内部url") ||
    text.includes("内部サービス") ||
    text.includes("プライベートip")
  );
}

function looksLikeResourceExhaustion(analysis: DeepDiveAnalysis): boolean {
  const text = analysisSearchText(analysis);
  return (
    text.includes("denial_of_service") ||
    text.includes("denial of service") ||
    text.includes("dos") ||
    text.includes("memory") ||
    text.includes("large") ||
    text.includes("slow") ||
    text.includes("メモリ") ||
    text.includes("大容量") ||
    text.includes("遅い")
  );
}

function analysisSearchText(analysis: DeepDiveAnalysis): string {
  return [
    analysis.title,
    analysis.verdictSummary,
    analysis.verdictReason,
    analysis.attackStory.impact,
    analysis.attackStory.whyItWorks,
    ...analysis.evidence.map((item) => item.codeFact),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function verdictLines(concern: ReportableConcern): string[] {
  const lines = [
    `shouldReport: ${concern.analysis.shouldReport}`,
    `verdict: ${concern.analysis.verdict}`,
    `severity: ${concern.analysis.severity}`,
    `confidence: ${concern.analysis.confidence}`,
  ];

  if (concern.validation) {
    lines.push(`humanVerdict: ${concern.validation.humanVerdict}`);
    lines.push(`operationalContext: ${concern.validation.operationalContext}`);
  }

  return lines;
}

function paintSeverity(severity: DeepDiveAnalysis["severity"], useColor: boolean): string {
  const label = `[${severity.toUpperCase()}]`;
  if (!useColor) {
    return label;
  }

  const color =
    severity === "critical" || severity === "high"
      ? "\x1b[31m"
      : severity === "medium"
        ? "\x1b[33m"
        : "\x1b[36m";

  return `${color}${label}\x1b[0m`;
}

function severityRank(severity: DeepDiveAnalysis["severity"]): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[severity];
}

function shouldUseColor(): boolean {
  return process.stdout.isTTY && !process.env.NO_COLOR;
}

function isScanRunRecord(value: unknown): value is ScanRunRecord {
  return isRecord(value) && value.recordType === "scan.run";
}

function isDeepDiveResult(value: unknown): value is DeepDiveResult {
  return isRecord(value) && value.recordType === "scan.deep_dive" && Array.isArray(value.analyses);
}

function isHumanValidationRecord(value: unknown): value is HumanValidationRecord {
  return isRecord(value) && value.recordType === "scan.human_validation" && Array.isArray(value.validatedConcerns);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
