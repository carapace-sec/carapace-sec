import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { TargetFileRecord } from "./file-collector.js";

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;

export type ReadFileSummary = {
  relativePath: string;
  absolutePath: string;
  realPath: string;
  encoding: "utf8";
  sizeBytes: number;
  charCount: number;
  lineCount: number;
  sha256: string;
};

export type ReadFileFailure = {
  relativePath: string;
  absolutePath: string;
  error: string;
};

export type ReadFileContent = ReadFileSummary & {
  content: string;
};

export type ReadTargetFilesOptions = {
  allowedRoot?: string;
  maxFileBytes?: number;
  maxTotalBytes?: number;
};

export type FileReadResult = {
  readFiles: ReadFileContent[];
  failedFiles: ReadFileFailure[];
  summary: {
    readFileCount: number;
    failedFileCount: number;
    totalBytes: number;
    totalChars: number;
    totalLines: number;
    files: ReadFileSummary[];
    failedFiles: ReadFileFailure[];
  };
};

export function readTargetFiles(targetFiles: TargetFileRecord[], options: ReadTargetFilesOptions = {}): FileReadResult {
  const readFiles: ReadFileContent[] = [];
  const failedFiles: ReadFileFailure[] = [];
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const allowedRoot = options.allowedRoot ? fs.realpathSync.native(options.allowedRoot) : null;
  let acceptedBytes = 0;

  for (const file of targetFiles) {
    try {
      const realPath = fs.realpathSync.native(file.absolutePath);
      if (allowedRoot && !isPathInside(realPath, allowedRoot)) {
        throw new Error(`Refusing to read outside scan root. realpath=${realPath}`);
      }

      const stat = fs.statSync(realPath);
      if (!stat.isFile()) {
        throw new Error("Refusing to read non-file target.");
      }

      if (stat.size > maxFileBytes) {
        throw new Error(`Refusing to read file larger than ${maxFileBytes} bytes. size=${stat.size}`);
      }

      if (acceptedBytes + stat.size > maxTotalBytes) {
        throw new Error(
          `Refusing to exceed total read limit of ${maxTotalBytes} bytes. current=${acceptedBytes} next=${stat.size}`,
        );
      }

      const content = fs.readFileSync(realPath, "utf8");
      const sizeBytes = Buffer.byteLength(content, "utf8");
      if (sizeBytes > maxFileBytes) {
        throw new Error(`Refusing to read file larger than ${maxFileBytes} bytes. size=${sizeBytes}`);
      }

      if (acceptedBytes + sizeBytes > maxTotalBytes) {
        throw new Error(
          `Refusing to exceed total read limit of ${maxTotalBytes} bytes. current=${acceptedBytes} next=${sizeBytes}`,
        );
      }

      acceptedBytes += sizeBytes;
      const summary: ReadFileSummary = {
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        realPath,
        encoding: "utf8",
        sizeBytes,
        charCount: content.length,
        lineCount: countLines(content),
        sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      };

      readFiles.push({
        ...summary,
        content,
      });
    } catch (error) {
      failedFiles.push({
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const files = readFiles.map(({ content: _content, ...summary }) => summary);

  return {
    readFiles,
    failedFiles,
    summary: {
      readFileCount: readFiles.length,
      failedFileCount: failedFiles.length,
      totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
      totalChars: files.reduce((total, file) => total + file.charCount, 0),
      totalLines: files.reduce((total, file) => total + file.lineCount, 0),
      files,
      failedFiles,
    },
  };
}

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}
