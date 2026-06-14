import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ScanProfile, TargetFileRecord } from "./file-collector.js";
import type { FileReadResult } from "./file-reader.js";
import type { TriageResult } from "./triage.js";
import type { DeepDiveResult } from "./deep-dive.js";
import { readPackageVersion } from "./package-info.js";

export type ScanStatus = "completed" | "failed";

export type ScanRunRecord = {
  schemaVersion: 1;
  recordType: "scan.run";
  runId: string;
  createdAt: string;
  completedAt: string;
  status: ScanStatus;
  command: {
    name: "scan";
    argv: string[];
  };
  target: {
    inputPath: string;
    resolvedPath: string;
  };
  scope: {
    profile: ScanProfile;
    targetFiles: TargetFileRecord[];
    missingFiles: Array<{
      relativePath: string;
      reason: string;
    }>;
  };
  inputRead: FileReadResult["summary"];
  resultSummary: {
    findingCount: number;
    findingsRecordType: "scan.finding";
  };
  reviewState: {
    status: "not_reviewed";
    answerRecordType: "review.answer";
  };
  tool: {
    name: "carapace";
    version: string;
  };
};

export type RunIndexRecord = {
  schemaVersion: 1;
  recordType: "scan.run_index";
  runId: string;
  createdAt: string;
  completedAt: string;
  status: ScanStatus;
  targetPath: string;
  runFile: string;
  findingCount: number;
  targetFileCount: number;
};

export type StoredScanRun = {
  runId: string;
  runFilePath: string;
  indexFilePath: string;
  record: ScanRunRecord;
};

export type TriageErrorRecord = {
  schemaVersion: 1;
  recordType: "scan.triage_error";
  createdAt: string;
  error: string;
};

export type DeepDiveErrorRecord = {
  schemaVersion: 1;
  recordType: "scan.deep_dive_error";
  createdAt: string;
  error: string;
};

export type HumanValidationRecord = {
  schemaVersion: 1;
  recordType: "scan.human_validation";
  validationVersion: 1;
  createdAt: string;
  source: "owner_context";
  roadmapStage: 1;
  stageCondition: "owner_confirmed_real_concern";
  conditionSatisfied: boolean;
  summary: string;
  validatedConcerns: Array<{
    triageId: string;
    title: string;
    humanVerdict: "real_concern" | "supporting_concern" | "not_a_concern";
    shouldReport: boolean;
    reason: string;
    operationalContext: string;
  }>;
  nextStep: string;
};

export type ReviewVerdict = "real_concern" | "false_positive" | "needs_validation";

export type ReviewAnswerRecord = {
  schemaVersion: 1;
  recordType: "review.answer";
  reviewVersion: 1;
  createdAt: string;
  runId: string;
  source: "human_cli";
  profile: ScanProfile | "unknown";
  target: {
    triageId: string;
    relativePath: string;
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    confidence: "low" | "medium" | "high";
    deepDiveVerdict: string;
    shouldReportAtScanTime: boolean;
  };
  answer: {
    verdict: ReviewVerdict;
    note: string;
  };
  learning: {
    aggregationKey: string;
    patternHint: string;
  };
};

export type RunRecordAppend =
  | TriageResult
  | TriageErrorRecord
  | DeepDiveResult
  | DeepDiveErrorRecord
  | HumanValidationRecord
  | ReviewAnswerRecord;

type StoreScanRunInput = {
  cwd: string;
  argv: string[];
  inputPath: string;
  resolvedPath: string;
  startedAt: Date;
  completedAt: Date;
  status: ScanStatus;
  profile: ScanProfile;
  targetFiles: TargetFileRecord[];
  missingFiles: Array<{
    relativePath: string;
    reason: string;
  }>;
  inputRead: FileReadResult["summary"];
};

export function storeScanRun(input: StoreScanRunInput): StoredScanRun {
  const runsDir = path.join(input.cwd, ".carapace", "runs");
  fs.mkdirSync(runsDir, { recursive: true });

  const runId = createRunId(input.startedAt);
  const runFileName = `${runId}.jsonl`;
  const runFilePath = path.join(runsDir, runFileName);
  const indexFilePath = path.join(runsDir, "index.jsonl");

  const record: ScanRunRecord = {
    schemaVersion: 1,
    recordType: "scan.run",
    runId,
    createdAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    status: input.status,
    command: {
      name: "scan",
      argv: input.argv,
    },
    target: {
      inputPath: input.inputPath,
      resolvedPath: input.resolvedPath,
    },
    scope: {
      profile: input.profile,
      targetFiles: input.targetFiles,
      missingFiles: input.missingFiles,
    },
    inputRead: input.inputRead,
    resultSummary: {
      findingCount: 0,
      findingsRecordType: "scan.finding",
    },
    reviewState: {
      status: "not_reviewed",
      answerRecordType: "review.answer",
    },
    tool: {
      name: "carapace",
      version: readPackageVersion(),
    },
  };

  const indexRecord: RunIndexRecord = {
    schemaVersion: 1,
    recordType: "scan.run_index",
    runId,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    status: record.status,
    targetPath: record.target.resolvedPath,
    runFile: path.relative(runsDir, runFilePath),
    findingCount: record.resultSummary.findingCount,
    targetFileCount: record.inputRead.readFileCount,
  };

  appendJsonLine(runFilePath, record);
  appendJsonLine(indexFilePath, indexRecord);

  return {
    runId,
    runFilePath,
    indexFilePath,
    record,
  };
}

export function readJsonlFile(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

export function appendRunRecord(filePath: string, value: RunRecordAppend): void {
  appendJsonLine(filePath, value);
}

function appendJsonLine(filePath: string, value: unknown): void {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function createRunId(startedAt: Date): string {
  const timestamp = startedAt.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
  const suffix = randomUUID().slice(0, 8);
  return `${timestamp}-${suffix}`;
}
