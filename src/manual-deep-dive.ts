import { isOutputLanguage, readProjectConfig, type OutputLanguage } from "./config.js";
import { runDeepDive } from "./deep-dive.js";
import { readTargetFiles } from "./file-reader.js";
import { getDeepDiveMessages, resolveOutputLanguage, type DeepDiveMessages } from "./messages.js";
import {
  appendRunRecord,
  readJsonlFile,
  type DeepDiveErrorRecord,
  type ScanRunRecord,
} from "./records.js";
import { resolveRunFile } from "./run-files.js";
import type { TriageCandidate, TriageResult } from "./triage.js";
import { formatUserFacingError } from "./user-errors.js";

export async function runManualDeepDive(argv: string[], cwd: string): Promise<number> {
  const configuredLanguage = readProjectConfig(cwd)?.outputLanguage;
  let messages = getDeepDiveMessages(resolveOutputLanguage({ configured: configuredLanguage }));
  let args: {
    runIdOrFile?: string;
    candidateId?: string;
    language: OutputLanguage;
  };

  try {
    const language = resolveOutputLanguage({
      explicit: readLanguageOption(argv, messages),
      configured: configuredLanguage,
    });
    messages = getDeepDiveMessages(language);
    args = parseManualDeepDiveArgs(argv, messages, language);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(messages.prefix(message));
    return 1;
  }

  if (!args.runIdOrFile || !args.candidateId) {
    console.error(messages.prefix(messages.missingArgs()));
    console.error(messages.usage());
    return 1;
  }

  try {
    const runFilePath = resolveRunFile(cwd, args.runIdOrFile);
    const loaded = loadManualDeepDiveTarget(runFilePath, args.candidateId, messages);
    const inputRead = readTargetFiles(loaded.run.scope.targetFiles, {
      allowedRoot: loaded.run.target.resolvedPath,
    });

    if (inputRead.failedFiles.length > 0) {
      for (const file of inputRead.failedFiles) {
        console.error(messages.failedToReadFile(file.relativePath, file.error));
      }
      return 1;
    }

    console.log(messages.target(loaded.candidate.id));
    console.log(messages.run(loaded.run.runId));
    console.log(messages.profile(loaded.run.scope.profile));
    console.log(messages.candidate(loaded.candidate.confidence, loaded.candidate.relativePath, loaded.candidate.title));

    const deepDive = await runDeepDive({
      cwd,
      files: inputRead.readFiles,
      candidates: [loaded.candidate],
      maxCandidates: 1,
      forceCandidates: true,
      language: args.language,
    });

    if (!deepDive) {
      console.log(messages.skippedNoApiKey());
      return 0;
    }

    appendRunRecord(runFilePath, deepDive);
    console.log(messages.model(deepDive.model));
    console.log(messages.analyses(deepDive.analyzedCandidateCount));
    for (const analysis of deepDive.analyses) {
      console.log(messages.analysisLine(analysis.verdict, analysis.confidence, analysis.relativePath, analysis.title));
      console.log(messages.shouldReport(analysis.shouldReport));
    }
    console.log(messages.savedRecord(runFilePath));

    return 0;
  } catch (error) {
    const message = formatUserFacingError(error, args.language);
    if (args.runIdOrFile) {
      tryAppendDeepDiveError(cwd, args.runIdOrFile, message);
    }
    console.error(messages.prefix(message));
    return 1;
  }
}

function parseManualDeepDiveArgs(
  argv: string[],
  messages: DeepDiveMessages,
  language: OutputLanguage,
): {
  runIdOrFile?: string;
  candidateId?: string;
  language: OutputLanguage;
} {
  const values: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--lang") {
      readOptionValue(argv, index, value, messages);
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown deep-dive option: ${value}`);
    }

    values.push(value);
  }

  return {
    runIdOrFile: values[0],
    candidateId: values[1],
    language,
  };
}

function readLanguageOption(argv: string[], messages: DeepDiveMessages): OutputLanguage | undefined {
  const index = argv.indexOf("--lang");
  if (index === -1) {
    return undefined;
  }

  const raw = readOptionValue(argv, index, "--lang", messages);
  if (isOutputLanguage(raw)) {
    return raw;
  }

  throw new Error(`Unknown --lang value: ${raw}. Use ja or en.`);
}

function readOptionValue(argv: string[], index: number, option: string, messages: DeepDiveMessages): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} value is missing.`);
  }

  return value;
}

function loadManualDeepDiveTarget(
  runFilePath: string,
  candidateId: string,
  messages: DeepDiveMessages,
): {
  run: ScanRunRecord;
  triage: TriageResult;
  candidate: TriageCandidate;
} {
  const records = readJsonlFile(runFilePath);
  const run = records.find(isScanRunRecord);
  const triage = records.filter(isTriageResult).at(-1);

  if (!run) {
    throw new Error(messages.noScanRunRecord(runFilePath));
  }

  if (!triage) {
    throw new Error(messages.noTriageRecord(runFilePath));
  }

  const candidate = triage.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new Error(messages.noTriageCandidate(candidateId));
  }

  return {
    run,
    triage,
    candidate,
  };
}

function tryAppendDeepDiveError(cwd: string, runIdOrFile: string, message: string): void {
  try {
    const runFilePath = resolveRunFile(cwd, runIdOrFile);
    const record: DeepDiveErrorRecord = {
      schemaVersion: 1,
      recordType: "scan.deep_dive_error",
      createdAt: new Date().toISOString(),
      error: message,
    };
    appendRunRecord(runFilePath, record);
  } catch {
    // If the run itself cannot be resolved, there is nowhere safe to append the error.
  }
}

function isScanRunRecord(value: unknown): value is ScanRunRecord {
  return isRecord(value) && value.recordType === "scan.run" && isRecord(value.scope);
}

function isTriageResult(value: unknown): value is TriageResult {
  return isRecord(value) && value.recordType === "scan.triage" && Array.isArray(value.candidates);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
