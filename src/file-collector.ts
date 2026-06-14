import fs from "node:fs";
import path from "node:path";

export type ScanProfile = string;

export const DEFAULT_SCAN_PROFILE = "auto-initial";
export const CARAPACE_SELF_PROFILE = "carapace-self-initial";

export type TargetFileRecord = {
  relativePath: string;
  absolutePath: string;
  reason: string;
  sizeBytes: number;
};

export type FileCollection = {
  profile: ScanProfile;
  targetRoot: string;
  targetFiles: TargetFileRecord[];
  missingFiles: Array<{
    relativePath: string;
    reason: string;
  }>;
};

export type LocalScanProfile = {
  schemaVersion?: 1;
  name?: string;
  focus?: string;
  files: CandidateFile[];
};

type CandidateFile = {
  relativePath: string;
  reason: string;
};

type ScoredCandidate = CandidateFile & {
  score: number;
};

const MAX_AUTO_FILES = 24;
const MAX_AUTO_WALK_FILES = 5000;
const MAX_AUTO_FILE_BYTES = 384 * 1024;

const SKIPPED_DIRECTORIES = new Set([
  ".carapace",
  ".git",
  ".hg",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "tmp",
  "vendor",
]);

const CODE_EXTENSIONS = new Set([
  ".cjs",
  ".cs",
  ".cts",
  ".go",
  ".graphql",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

const AUTO_KEYWORDS: Array<{
  pattern: RegExp;
  score: number;
  reason: string;
}> = [
  {
    pattern: /auth|login|session|token|jwt|oauth|saml|password|credential/i,
    score: 10,
    reason: "Authentication or session-related code is a common entry point for account and privilege abuse.",
  },
  {
    pattern: /tenant|workspace|organization|organisation|account|permission|access|acl|role|admin|impersonat/i,
    score: 9,
    reason: "Authorization, tenant isolation, role, or impersonation code controls who can act on whose data.",
  },
  {
    pattern: /webhook|callback|public|route|controller|endpoint|api|handler|middleware/i,
    score: 8,
    reason: "Route, webhook, or public endpoint code often receives attacker-controlled input.",
  },
  {
    pattern: /url|uri|fetch|http|request|proxy|redirect|crawl|rss|feed|calendar|ical|import|sync/i,
    score: 8,
    reason: "Externally controlled URL or fetch paths can lead to SSRF, redirect, or resource-exhaustion issues.",
  },
  {
    pattern: /upload|download|file|path|archive|zip|template|render|parse|deserialize/i,
    score: 7,
    reason: "File, parser, template, and serialization paths often cross trust boundaries.",
  },
  {
    pattern: /sign|signature|verify|csrf|csp|header|cookie|origin|cors/i,
    score: 7,
    reason: "Signature, header, cookie, CORS, and browser-isolation code can make or break request trust.",
  },
  {
    pattern: /queue|worker|job|notify|email|slack|telegram|retry/i,
    score: 5,
    reason: "Worker, retry, and outbound notification paths can amplify untrusted input or resource use.",
  },
];

const CARAPACE_SELF_INITIAL_FILES: CandidateFile[] = [
  {
    relativePath: "package.json",
    reason: "CLI entry point, runtime dependency surface, scripts, and npm packaging metadata.",
  },
  {
    relativePath: "src/cli.ts",
    reason: "Command dispatch, scan orchestration, profile selection, and AI analysis flow.",
  },
  {
    relativePath: "src/file-collector.ts",
    reason: "Profile-based target file selection and scan-root path construction.",
  },
  {
    relativePath: "src/file-reader.ts",
    reason: "Realpath containment, file-size limits, file reads, and read summaries.",
  },
  {
    relativePath: "src/prompt-security.ts",
    reason: "Prompt-injection boundary text and untrusted repository file formatting.",
  },
  {
    relativePath: "src/triage.ts",
    reason: "Triage prompt construction, untrusted file inclusion, model call, and JSON parsing.",
  },
  {
    relativePath: "src/deep-dive.ts",
    reason: "Deep-dive prompt construction, candidate selection, model call, and JSON parsing.",
  },
  {
    relativePath: "src/manual-deep-dive.ts",
    reason: "Recorded candidate replay path and manual deep-dive file reread behavior.",
  },
  {
    relativePath: "src/anthropic-client.ts",
    reason: "Only intended external network client creation and API key use for model calls.",
  },
  {
    relativePath: "src/config.ts",
    reason: "Local config loading, model selection persistence, and API key source resolution.",
  },
  {
    relativePath: "src/secrets.ts",
    reason: "Local encrypted API key storage and PowerShell child-process usage.",
  },
  {
    relativePath: "src/init.ts",
    reason: "API key initialization, local credential writes, and triage model selection.",
  },
  {
    relativePath: "src/records.ts",
    reason: "JSONL run record writing and persisted scan/deep-dive/review record schemas.",
  },
  {
    relativePath: "src/run-files.ts",
    reason: "Run file lookup by ID or path and access to recorded scan files.",
  },
  {
    relativePath: "src/report.ts",
    reason: "Report rendering from recorded deep-dive analyses and review answers.",
  },
  {
    relativePath: "src/review.ts",
    reason: "Human validation recording, review target selection, and feedback persistence.",
  },
  {
    relativePath: "src/model-registry.ts",
    reason: "Model preset registry, fixed deep-dive model, and free model-selection policy.",
  },
];

export function isSafeScanProfileName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(value);
}

export function collectTargetFiles(targetRoot: string, cwd = process.cwd()): FileCollection {
  return collectProfileTargetFiles(targetRoot, DEFAULT_SCAN_PROFILE, { cwd });
}

export function collectProfileTargetFiles(
  targetRoot: string,
  profile: ScanProfile,
  options: { cwd?: string } = {},
): FileCollection {
  if (!isSafeScanProfileName(profile)) {
    throw new Error(`Unsafe scan profile name: ${profile}`);
  }

  const resolvedRoot = path.resolve(targetRoot);
  const candidates = candidatesForProfile(resolvedRoot, profile, options.cwd ?? process.cwd());
  return collectCandidates(resolvedRoot, profile, candidates);
}

export function readLocalScanProfile(cwd: string, profile: ScanProfile): LocalScanProfile | null {
  if (!isSafeScanProfileName(profile)) {
    return null;
  }

  const profilePath = path.join(cwd, ".carapace", "profiles", `${profile}.json`);
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(profilePath, "utf8")) as Partial<LocalScanProfile>;
  if (!Array.isArray(parsed.files)) {
    throw new Error(`Local profile ${profile} must contain a files array.`);
  }

  return {
    schemaVersion: parsed.schemaVersion,
    name: typeof parsed.name === "string" ? parsed.name : profile,
    focus: typeof parsed.focus === "string" ? parsed.focus : undefined,
    files: normalizeCandidateFiles(parsed.files),
  };
}

function collectCandidates(resolvedRoot: string, profile: ScanProfile, candidates: CandidateFile[]): FileCollection {
  const targetFiles: TargetFileRecord[] = [];
  const missingFiles: FileCollection["missingFiles"] = [];

  for (const candidate of candidates) {
    const safeRelativePath = normalizeSafeRelativePath(candidate.relativePath);
    if (!safeRelativePath) {
      missingFiles.push({
        relativePath: candidate.relativePath,
        reason: `Unsafe profile path ignored. ${candidate.reason}`,
      });
      continue;
    }

    const absolutePath = path.join(resolvedRoot, safeRelativePath);
    if (!fs.existsSync(absolutePath)) {
      missingFiles.push({
        relativePath: safeRelativePath,
        reason: candidate.reason,
      });
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      missingFiles.push({
        relativePath: safeRelativePath,
        reason: candidate.reason,
      });
      continue;
    }

    targetFiles.push({
      relativePath: normalizeRelativePath(safeRelativePath),
      absolutePath,
      reason: candidate.reason,
      sizeBytes: stat.size,
    });
  }

  return {
    profile,
    targetRoot: resolvedRoot,
    targetFiles,
    missingFiles,
  };
}

function candidatesForProfile(targetRoot: string, profile: ScanProfile, cwd: string): CandidateFile[] {
  const localProfile = readLocalScanProfile(cwd, profile);
  if (localProfile) {
    return localProfile.files;
  }

  if (profile === CARAPACE_SELF_PROFILE) {
    return CARAPACE_SELF_INITIAL_FILES;
  }

  if (profile === DEFAULT_SCAN_PROFILE) {
    return collectAutoInitialCandidates(targetRoot);
  }

  throw new Error(
    `Unknown scan profile: ${profile}. Use ${DEFAULT_SCAN_PROFILE}, ${CARAPACE_SELF_PROFILE}, or add .carapace/profiles/${profile}.json.`,
  );
}

function collectAutoInitialCandidates(targetRoot: string): CandidateFile[] {
  const scored: ScoredCandidate[] = [];
  let visitedFiles = 0;

  walk(targetRoot, (absolutePath) => {
    if (visitedFiles >= MAX_AUTO_WALK_FILES) {
      return;
    }
    visitedFiles += 1;

    const relativePath = normalizeRelativePath(path.relative(targetRoot, absolutePath));
    const extension = path.extname(relativePath).toLowerCase();
    if (!CODE_EXTENSIONS.has(extension) && !isSecurityDoc(relativePath)) {
      return;
    }

    const stat = fs.statSync(absolutePath);
    if (stat.size > MAX_AUTO_FILE_BYTES) {
      return;
    }

    const score = scorePath(relativePath);
    if (!score) {
      return;
    }

    scored.push({
      relativePath,
      reason: score.reason,
      score: score.score,
    });
  });

  return scored
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
    .slice(0, MAX_AUTO_FILES)
    .map(({ score: _score, ...candidate }) => candidate);
}

function walk(directory: string, onFile: (absolutePath: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        walk(absolutePath, onFile);
      }
      continue;
    }

    if (entry.isFile()) {
      onFile(absolutePath);
    }
  }
}

function scorePath(relativePath: string): { score: number; reason: string } | null {
  const matches = AUTO_KEYWORDS.filter((keyword) => keyword.pattern.test(relativePath));
  if (matches.length === 0) {
    return isSecurityDoc(relativePath)
      ? {
          score: 4,
          reason: "Security documentation can describe trust boundaries and disclosure expectations.",
        }
      : null;
  }

  const best = matches.sort((left, right) => right.score - left.score)[0];
  const total = matches.reduce((sum, match) => sum + match.score, 0);
  return {
    score: best.score * 10 + total,
    reason: best.reason,
  };
}

function isSecurityDoc(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return normalized === "security.md" || normalized.endsWith("/security.md");
}

function normalizeCandidateFiles(files: CandidateFile[]): CandidateFile[] {
  return files.flatMap((file) => {
    if (!isRecord(file) || typeof file.relativePath !== "string" || typeof file.reason !== "string") {
      return [];
    }

    return [
      {
        relativePath: file.relativePath,
        reason: file.reason,
      },
    ];
  });
}

function normalizeSafeRelativePath(value: string): string | null {
  if (path.isAbsolute(value)) {
    return null;
  }

  const normalized = path.normalize(value);
  if (normalized === "." || normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
