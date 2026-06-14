#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isOutputLanguage, readProjectConfig, type OutputLanguage } from "./config.js";
import {
  DEFAULT_SCAN_PROFILE,
  collectProfileTargetFiles,
  isSafeScanProfileName,
  type ScanProfile,
} from "./file-collector.js";
import { readTargetFiles } from "./file-reader.js";
import { runDeepDive, selectDeepDiveCandidates, type DeepDiveResult } from "./deep-dive.js";
import { runInit } from "./init.js";
import { runManualDeepDive } from "./manual-deep-dive.js";
import { runReport } from "./report.js";
import { appendRunRecord, storeScanRun } from "./records.js";
import { runReview } from "./review.js";
import { runTriage, type TriageCandidate, type TriageResult } from "./triage.js";
import { isTriageModelPresetName, type TriageModelPresetName } from "./model-registry.js";
import { getHelpText, getScanMessages, resolveOutputLanguage, type ScanMessages } from "./messages.js";
import { readPackageVersion } from "./package-info.js";
import { formatUserFacingError } from "./user-errors.js";

const COMMANDS = ["init", "scan", "deep-dive", "report", "review", "help"] as const;
type Command = (typeof COMMANDS)[number];
type ScanStep = "full" | "triage";

type ScanOptions = {
  profile: ScanProfile;
  triageModelPreset?: TriageModelPresetName;
  triageProgressModel: string;
  step: ScanStep;
  noDeepDive: boolean;
  verbose: boolean;
  language: OutputLanguage;
};

function printHelp(language: OutputLanguage): void {
  console.log(getHelpText(language));
}

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

async function runScan(targetPath: string | undefined, argv: string[]): Promise<number> {
  if (!targetPath) {
    console.error("carapace scan: missing <path>.");
    console.error("Usage: carapace scan <path>");
    return 1;
  }

  const startedAt = new Date();
  const resolvedPath = path.resolve(process.cwd(), targetPath);
  let options: ScanOptions;
  try {
    options = readScanOptions(argv, process.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`carapace scan: ${message}`);
    return 1;
  }
  const messages = getScanMessages(options.language);
  if (!fs.existsSync(resolvedPath)) {
    console.error(messages.scan.targetPathNotFound(resolvedPath));
    return 1;
  }
  let collection: ReturnType<typeof collectProfileTargetFiles>;
  try {
    collection = collectProfileTargetFiles(resolvedPath, options.profile, { cwd: process.cwd() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`carapace scan: ${message}`);
    return 1;
  }
  const inputRead = readTargetFiles(collection.targetFiles, {
    allowedRoot: collection.targetRoot,
  });
  const completedAt = new Date();
  const status = inputRead.failedFiles.length === 0 && inputRead.summary.readFileCount > 0 ? "completed" : "failed";
  const storedRun = storeScanRun({
    cwd: process.cwd(),
    argv,
    inputPath: targetPath,
    resolvedPath,
    startedAt,
    completedAt,
    status,
    profile: collection.profile,
    targetFiles: collection.targetFiles,
    missingFiles: collection.missingFiles,
    inputRead: inputRead.summary,
  });

  console.log(messages.scan.started(resolvedPath));
  console.log(messages.scan.profile(collection.profile));
  console.log(messages.scan.readFiles(inputRead.summary.readFileCount, collection.targetFiles.length));
  if (options.verbose) {
    printCollectionTrace(collection, inputRead.summary, messages);
  }
  if (inputRead.failedFiles.length > 0) {
    console.error(messages.scan.failedToReadFiles(inputRead.failedFiles.length));
    for (const file of inputRead.failedFiles) {
      console.error(messages.scan.fileReadFailure(file.relativePath, file.error));
    }
  }
  console.log(messages.scan.runId(storedRun.runId));
  console.log(messages.scan.savedRunRecord(storedRun.runFilePath));
  if (status === "completed") {
    let analysisStage: "triage" | "deep_dive" = "triage";
    try {
      printProgress(messages.scan.triageInProgress(options.triageProgressModel));
      const triage = await runTriage({
        cwd: process.cwd(),
        files: inputRead.readFiles,
        profile: collection.profile,
        triageModelPreset: options.triageModelPreset,
        language: options.language,
      });
      if (triage) {
        appendRunRecord(storedRun.runFilePath, triage);
        console.log(messages.scan.triageModel(formatTriageModel(triage)));
        console.log(messages.scan.triageCandidates(triage.candidateCount));
        if (options.verbose) {
          printTriageTrace(triage, messages);
        }
        const deepDiveCandidates = selectDeepDiveCandidates(triage.candidates);
        const manualDeepDiveCandidates = selectManualDeepDiveRecommendations(triage.candidates);
        console.log(messages.scan.autoDeepDiveCandidates(deepDiveCandidates.length));
        console.log(messages.scan.recommendedManualDeepDives(manualDeepDiveCandidates.length));
        if (options.verbose) {
          printAutoDeepDiveTrace(deepDiveCandidates, messages);
          printManualDeepDiveTrace(manualDeepDiveCandidates, messages);
        }
        if (options.step === "triage") {
          console.log(messages.scan.stepTriageOnly());
          if (options.verbose) {
            console.log(messages.scan.reportableNotComputed());
          }
        } else if (options.noDeepDive) {
          console.log(messages.scan.deepDiveSkipped());
          if (options.verbose) {
            console.log(messages.scan.reportableNotComputed());
          }
        } else {
          analysisStage = "deep_dive";
          if (deepDiveCandidates.length > 0) {
            printProgress(messages.scan.deepDiveInProgress(deepDiveCandidates.length, "Opus"));
          }
          const deepDive = await runDeepDive({
            cwd: process.cwd(),
            files: inputRead.readFiles,
            candidates: triage.candidates,
            language: options.language,
          });
          if (deepDive) {
            appendRunRecord(storedRun.runFilePath, deepDive);
            console.log(messages.scan.deepDiveModel(deepDive.model));
            console.log(messages.scan.deepDiveAnalyses(deepDive.analyzedCandidateCount));
            console.log(messages.scan.reportableConcerns(countReportableConcerns(deepDive)));
            if (options.verbose) {
              printDeepDiveTrace(deepDive, messages);
            }
            console.log("");
            console.log(messages.scan.reportTitle());
            console.log(messages.scan.reportUnderline());
            runReport(["report", storedRun.runFilePath, "--lang", options.language], process.cwd());
          }
        }
      } else {
        console.log(messages.scan.aiTriageSkipped());
      }
    } catch (error) {
      const message = formatUserFacingError(error, options.language);
      const recordType = analysisStage === "deep_dive" ? "scan.deep_dive_error" : "scan.triage_error";
      appendRunRecord(storedRun.runFilePath, {
        schemaVersion: 1,
        recordType,
        createdAt: new Date().toISOString(),
        error: message,
      });
      console.error(messages.scan.aiAnalysisFailed(message));
      return 1;
    }
  }
  return status === "completed" ? 0 : 1;
}

function readScanOptions(argv: string[], cwd: string): ScanOptions {
  const config = readProjectConfig(cwd);
  const triageModelPreset = readTriageModelPreset(argv);
  return {
    profile: readProfile(argv),
    triageModelPreset,
    triageProgressModel: triageModelPreset ?? config?.triageModelPreset ?? "haiku",
    step: readStep(argv),
    noDeepDive: argv.includes("--no-deep-dive"),
    verbose: argv.includes("--verbose") || argv.includes("--log"),
    language: resolveOutputLanguage({
      explicit: readOutputLanguage(argv),
      configured: config?.outputLanguage,
    }),
  };
}

function readTriageModelPreset(argv: string[]): TriageModelPresetName | undefined {
  const index = argv.indexOf("--triage-model");
  if (index === -1) {
    return undefined;
  }

  const raw = argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error("Missing value for --triage-model.");
  }

  if (isTriageModelPresetName(raw)) {
    return raw;
  }

  throw new Error(`Unknown --triage-model value: ${raw}. Use haiku or sonnet.`);
}

function readProfile(argv: string[]): ScanProfile {
  const index = argv.indexOf("--profile");
  const raw = index === -1 ? null : argv[index + 1];
  if (!raw) {
    return DEFAULT_SCAN_PROFILE;
  }

  if (isSafeScanProfileName(raw)) {
    return raw;
  }

  throw new Error(`Unsafe scan profile name: ${raw}`);
}

function readOutputLanguage(argv: string[]): OutputLanguage | undefined {
  const index = argv.indexOf("--lang");
  if (index === -1) {
    return undefined;
  }

  const raw = argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error("Missing value for --lang.");
  }

  if (isOutputLanguage(raw)) {
    return raw;
  }

  throw new Error(`Unknown --lang value: ${raw}. Use ja or en.`);
}

function readStep(argv: string[]): ScanStep {
  const index = argv.indexOf("--step");
  if (index === -1) {
    return "full";
  }

  const raw = argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error("Missing value for --step.");
  }

  if (raw === "triage") {
    return raw;
  }

  throw new Error(`Unknown --step value: ${raw}`);
}

function formatTriageModel(triage: { model: string; modelPreset?: string }): string {
  return triage.modelPreset ? `${triage.modelPreset} (${triage.model})` : triage.model;
}

function printProgress(message: string): void {
  if (process.stdout.isTTY) {
    console.log(message);
  }
}

function printCollectionTrace(
  collection: ReturnType<typeof collectProfileTargetFiles>,
  summary: ReturnType<typeof readTargetFiles>["summary"],
  messages: ScanMessages,
): void {
  console.log("");
  console.log(messages.trail.title());
  console.log(messages.trail.underline());
  console.log(messages.trail.targetFiles(collection.targetFiles.length));
  for (const file of collection.targetFiles) {
    console.log(`  - ${file.relativePath}`);
  }
  console.log(messages.trail.missingExpectedFiles(collection.missingFiles.length));
  if (collection.missingFiles.length === 0) {
    console.log(messages.trail.none());
  } else {
    for (const file of collection.missingFiles) {
      console.log(`  - ${file.relativePath}`);
    }
  }
  console.log(messages.trail.readBytes(summary.totalBytes));
  console.log(messages.trail.readLines(summary.totalLines));
}

function printTriageTrace(triage: TriageResult, messages: ScanMessages): void {
  console.log(messages.trail.triageTitle());
  if (triage.candidates.length === 0) {
    console.log(messages.trail.noCandidates());
    return;
  }

  for (const candidate of triage.candidates) {
    console.log(
      `  - ${candidate.id} [${formatCandidateConfidence(candidate)}] ${candidate.relativePath}: ${candidate.title}`,
    );
    if (candidate.severityReason) {
      console.log(messages.trail.reason(candidate.severityReason));
    }
    if (candidate.manualDeepDiveRecommended && candidate.manualDeepDiveReason) {
      console.log(messages.trail.manualDeepDiveReason(candidate.manualDeepDiveReason));
    }
  }
}

function printAutoDeepDiveTrace(candidates: TriageCandidate[], messages: ScanMessages): void {
  console.log(messages.trail.autoDeepDiveTitle());
  if (candidates.length === 0) {
    console.log(messages.trail.none());
    return;
  }

  for (const candidate of candidates) {
    console.log(`  - ${candidate.id} [${formatCandidateConfidence(candidate)}] ${candidate.relativePath}: ${candidate.title}`);
  }
}

function printManualDeepDiveTrace(candidates: TriageCandidate[], messages: ScanMessages): void {
  console.log(messages.trail.manualDeepDiveTitle());
  if (candidates.length === 0) {
    console.log(messages.trail.none());
    return;
  }

  for (const candidate of candidates) {
    console.log(`  - ${candidate.id} [${formatCandidateConfidence(candidate)}] ${candidate.relativePath}: ${candidate.title}`);
    if (candidate.manualDeepDiveReason) {
      console.log(messages.trail.reason(candidate.manualDeepDiveReason));
    }
  }
}

function printDeepDiveTrace(deepDive: DeepDiveResult, messages: ScanMessages): void {
  console.log(messages.trail.deepDiveTitle());
  if (deepDive.analyses.length === 0) {
    console.log(messages.trail.noAnalyses());
    return;
  }

  for (const analysis of deepDive.analyses) {
    console.log(`  - ${analysis.triageId} [${analysis.verdict}/${analysis.confidence}] ${analysis.relativePath}: ${analysis.title}`);
    if (analysis.verdictReason) {
      console.log(messages.trail.reason(analysis.verdictReason));
    }
    console.log(messages.trail.shouldReport(analysis.shouldReport));
  }
}

function countReportableConcerns(deepDive: DeepDiveResult): number {
  return deepDive.analyses.filter((analysis) => analysis.shouldReport).length;
}

function selectManualDeepDiveRecommendations(candidates: TriageCandidate[]): TriageCandidate[] {
  return candidates.filter((candidate) => candidate.confidence === "low" && candidate.manualDeepDiveRecommended === true);
}

function formatCandidateConfidence(candidate: TriageCandidate): string {
  return candidate.confidence === "low" && candidate.manualDeepDiveRecommended === true ? "low!" : candidate.confidence;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;

  if (command === "--version" || command === "-v") {
    console.log(`carapace ${readPackageVersion()}`);
    return 0;
  }

  if (!command) {
    printHelp(resolveCommandLanguage(argv, process.cwd()));
    return 0;
  }

  if (!isCommand(command)) {
    console.error(`Unknown command: ${command}`);
    console.error("");
    printHelp(resolveCommandLanguage(argv, process.cwd()));
    return 1;
  }

  if (command === "help") {
    try {
      printHelp(resolveCommandLanguage(argv, process.cwd()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`carapace help: ${message}`);
      return 1;
    }
    return 0;
  }

  if (command === "init") {
    return runInit(argv, process.cwd());
  }

  if (command === "deep-dive") {
    return runManualDeepDive(argv, process.cwd());
  }

  if (command === "report") {
    try {
      return runReport(argv, process.cwd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`carapace report: ${message}`);
      return 1;
    }
  }

  if (command === "review") {
    try {
      return runReview(argv, process.cwd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`carapace review: ${message}`);
      return 1;
    }
  }

  return runScan(args[0], argv);
}

function resolveCommandLanguage(argv: string[], cwd: string): OutputLanguage {
  return resolveOutputLanguage({
    explicit: readOutputLanguage(argv),
    configured: readProjectConfig(cwd)?.outputLanguage,
  });
}

process.exitCode = await main(process.argv.slice(2));
