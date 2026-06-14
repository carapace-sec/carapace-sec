import process from "node:process";
import { createInterface } from "node:readline/promises";
import { isOutputLanguage, readProjectConfig, type OutputLanguage } from "./config.js";
import type { DeepDiveAnalysis, DeepDiveResult } from "./deep-dive.js";
import { getReviewMessages, resolveOutputLanguage, type ReviewMessages } from "./messages.js";
import {
  appendRunRecord,
  readJsonlFile,
  type ReviewAnswerRecord,
  type ReviewVerdict,
  type ScanRunRecord,
} from "./records.js";
import { resolveRunFile } from "./run-files.js";

type ReviewArgs = {
  target?: string;
  triageId?: string;
  verdict?: ReviewVerdict;
  note?: string;
  help: boolean;
  language: OutputLanguage;
};

type LoadedReviewRun = {
  runFilePath: string;
  run?: ScanRunRecord;
  deepDive: DeepDiveResult;
  answers: ReviewAnswerRecord[];
};

export async function runReview(argv: string[], cwd: string): Promise<number> {
  const configuredLanguage = readProjectConfig(cwd)?.outputLanguage;
  let messages = getReviewMessages(resolveOutputLanguage({ configured: configuredLanguage }));
  let args: ReviewArgs;
  try {
    const language = resolveOutputLanguage({
      explicit: readLanguageOption(argv, messages),
      configured: configuredLanguage,
    });
    messages = getReviewMessages(language);
    args = parseReviewArgs(argv, messages, language);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(messages.prefix(message));
    return 1;
  }

  if (args.help) {
    console.log(messages.help());
    return 0;
  }

  try {
    const runFilePath = resolveRunFile(cwd, args.target);
    const loaded = loadReviewRun(runFilePath, messages);
    const target = selectReviewTarget(loaded, args.triageId, messages);

    printReviewTarget(loaded, target, messages);

    const verdict = args.verdict ?? (await promptVerdict(messages));
    const note = args.note ?? (await promptNote(messages));
    const record = createReviewAnswer(loaded, target, verdict, note);
    appendRunRecord(runFilePath, record);

    console.log("");
    console.log(messages.savedAnswer(record.answer.verdict, record.target.triageId));
    console.log(messages.runFile(runFilePath));
    console.log(messages.nextReview());

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(messages.prefix(message));
    return 1;
  }
}

function parseReviewArgs(argv: string[], messages: ReviewMessages, language: OutputLanguage): ReviewArgs {
  const args: ReviewArgs = { help: false, language };

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }

    if (value === "--lang") {
      readRequiredValue(argv, index, value, messages);
      index += 1;
      continue;
    }

    if (value === "--triage-id") {
      args.triageId = readRequiredValue(argv, index, value, messages);
      index += 1;
      continue;
    }

    if (value === "--verdict") {
      args.verdict = parseVerdict(readRequiredValue(argv, index, value, messages), messages);
      index += 1;
      continue;
    }

    if (value === "--note") {
      args.note = readRequiredValue(argv, index, value, messages);
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(messages.unknownOption(value));
    }

    if (args.target) {
      throw new Error(messages.unexpectedArgument(value));
    }

    args.target = value;
  }

  return args;
}

function readLanguageOption(argv: string[], messages: ReviewMessages): OutputLanguage | undefined {
  const index = argv.indexOf("--lang");
  if (index === -1) {
    return undefined;
  }

  const raw = argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error(messages.missingValue("--lang"));
  }

  if (isOutputLanguage(raw)) {
    return raw;
  }

  throw new Error("Unknown --lang value: " + raw + ". Use ja or en.");
}

function loadReviewRun(runFilePath: string, messages: ReviewMessages): LoadedReviewRun {
  const records = readJsonlFile(runFilePath);
  const run = records.find(isScanRunRecord);
  const deepDive = records.filter(isDeepDiveResult).at(-1);
  const answers = records.filter(isReviewAnswerRecord);

  if (!deepDive) {
    throw new Error(messages.noDeepDiveRecord(runFilePath));
  }

  return {
    runFilePath,
    run,
    deepDive,
    answers,
  };
}

function selectReviewTarget(
  loaded: LoadedReviewRun,
  triageId: string | undefined,
  messages: ReviewMessages,
): DeepDiveAnalysis {
  if (triageId) {
    const target = loaded.deepDive.analyses.find((analysis) => analysis.triageId === triageId);
    if (!target) {
      throw new Error(messages.noAnalysisForTriageId(triageId));
    }

    return target;
  }

  const reviewedIds = new Set(loaded.answers.map((answer) => answer.target.triageId));
  const target = loaded.deepDive.analyses.find(
    (analysis) => analysis.shouldReport && !reviewedIds.has(analysis.triageId),
  );

  if (!target) {
    throw new Error(messages.noUnreviewedConcerns());
  }

  return target;
}

function printReviewTarget(loaded: LoadedReviewRun, target: DeepDiveAnalysis, messages: ReviewMessages): void {
  const runId = loaded.run?.runId ?? "unknown";
  const profile = loaded.run?.scope.profile ?? "unknown";

  console.log(messages.target(target.triageId));
  console.log(messages.run(runId));
  console.log(messages.profile(profile));
  console.log(messages.finding(target.severity.toUpperCase(), target.title));
  console.log(messages.path(target.relativePath));
  console.log(messages.deepDiveVerdict(target.verdict));
  console.log(messages.confidence(target.confidence));
  console.log("");
  console.log(messages.summaryTitle());
  console.log(target.verdictSummary);
  console.log("");
  console.log(messages.attackStoryTitle());
  for (const [index, step] of target.attackStory.steps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
  console.log("");
}

async function promptVerdict(messages: ReviewMessages): Promise<ReviewVerdict> {
  if (!process.stdin.isTTY) {
    throw new Error(messages.noInteractiveTerminal());
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      console.log(messages.verdictTitle());
      for (const option of messages.verdictOptions()) {
        console.log(option);
      }
      const raw = (await rl.question(messages.verdictQuestion())).trim();
      const verdict = parseVerdictChoice(raw);
      if (verdict) {
        return verdict;
      }
      console.log(messages.invalidVerdictChoice());
    }
  } finally {
    rl.close();
  }
}

async function promptNote(messages: ReviewMessages): Promise<string> {
  if (!process.stdin.isTTY) {
    return "";
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(messages.noteQuestion())).trim();
  } finally {
    rl.close();
  }
}

function createReviewAnswer(
  loaded: LoadedReviewRun,
  target: DeepDiveAnalysis,
  verdict: ReviewVerdict,
  note: string,
): ReviewAnswerRecord {
  const profile = loaded.run?.scope.profile ?? "unknown";

  return {
    schemaVersion: 1,
    recordType: "review.answer",
    reviewVersion: 1,
    createdAt: new Date().toISOString(),
    runId: loaded.run?.runId ?? "unknown",
    source: "human_cli",
    profile,
    target: {
      triageId: target.triageId,
      relativePath: target.relativePath,
      title: target.title,
      severity: target.severity,
      confidence: target.confidence,
      deepDiveVerdict: target.verdict,
      shouldReportAtScanTime: target.shouldReport,
    },
    answer: {
      verdict,
      note,
    },
    learning: {
      aggregationKey: `${profile}:${target.relativePath}:${target.triageId}`,
      patternHint: `deepDiveVerdict=${target.verdict}; severity=${target.severity}; confidence=${target.confidence}`,
    },
  };
}

function readRequiredValue(argv: string[], index: number, option: string, messages: ReviewMessages): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(messages.missingValue(option));
  }

  return value;
}

function parseVerdict(value: string, messages: ReviewMessages): ReviewVerdict {
  const verdict = parseVerdictChoice(value);
  if (!verdict) {
    throw new Error(messages.unknownVerdict(value));
  }

  return verdict;
}

function parseVerdictChoice(value: string): ReviewVerdict | null {
  if (value === "1" || value === "real_concern") {
    return "real_concern";
  }

  if (value === "2" || value === "false_positive") {
    return "false_positive";
  }

  if (value === "3" || value === "needs_validation") {
    return "needs_validation";
  }

  return null;
}

function isScanRunRecord(value: unknown): value is ScanRunRecord {
  return isRecord(value) && value.recordType === "scan.run";
}

function isDeepDiveResult(value: unknown): value is DeepDiveResult {
  return isRecord(value) && value.recordType === "scan.deep_dive" && Array.isArray(value.analyses);
}

function isReviewAnswerRecord(value: unknown): value is ReviewAnswerRecord {
  return isRecord(value) && value.recordType === "review.answer" && isRecord(value.target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
