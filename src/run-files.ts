import fs from "node:fs";
import path from "node:path";

export function resolveRunFile(cwd: string, target: string | undefined): string {
  const runsDir = path.join(cwd, ".carapace", "runs");
  if (!fs.existsSync(runsDir)) {
    throw new Error("No .carapace/runs directory found. Run carapace scan first.");
  }
  const runsDirRealPath = fs.realpathSync.native(runsDir);

  if (!target) {
    const latest = fs
      .readdirSync(runsDir)
      .filter((name) => name.endsWith(".jsonl") && name !== "index.jsonl")
      .map((name) => path.join(runsDir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

    if (!latest) {
      throw new Error("No run files found in .carapace/runs.");
    }

    return resolveInsideRunsDir(latest, runsDirRealPath);
  }

  const directPath = path.resolve(cwd, target);
  if (fs.existsSync(directPath)) {
    return resolveInsideRunsDir(directPath, runsDirRealPath);
  }

  if (target.includes("/") || target.includes("\\") || path.isAbsolute(target)) {
    throw new Error("Run file path must stay inside .carapace/runs.");
  }

  const byName = path.join(runsDir, target.endsWith(".jsonl") ? target : `${target}.jsonl`);
  if (fs.existsSync(byName)) {
    return resolveInsideRunsDir(byName, runsDirRealPath);
  }

  throw new Error(`Run file not found: ${target}`);
}

function resolveInsideRunsDir(candidatePath: string, runsDirRealPath: string): string {
  const realPath = fs.realpathSync.native(candidatePath);
  const relative = path.relative(runsDirRealPath, realPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return realPath;
  }

  throw new Error("Run file path must stay inside .carapace/runs.");
}
