import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type StoredSecret = {
  schemaVersion: 1;
  provider: "anthropic";
  keyName: "apiKey";
  protection: "windows-secure-string";
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
};

export function canUseWindowsSecureString(): boolean {
  return process.platform === "win32";
}

export function writeEncryptedApiKey(filePath: string, apiKey: string): void {
  if (!canUseWindowsSecureString()) {
    throw new Error("Encrypted local API key storage is currently only implemented for Windows.");
  }

  const encryptedValue = protectWithWindowsSecureString(apiKey);
  const now = new Date().toISOString();
  const payload: StoredSecret = {
    schemaVersion: 1,
    provider: "anthropic",
    keyName: "apiKey",
    protection: "windows-secure-string",
    encryptedValue,
    createdAt: now,
    updatedAt: now,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function readEncryptedApiKey(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as StoredSecret;
  if (payload.protection !== "windows-secure-string") {
    throw new Error(`Unsupported secret protection: ${payload.protection}`);
  }

  return unprotectWithWindowsSecureString(payload.encryptedValue);
}

export function protectWithWindowsSecureString(secret: string): string {
  const script = [
    "$plain = [Console]::In.ReadToEnd()",
    "$secure = ConvertTo-SecureString -String $plain -AsPlainText -Force",
    "$secure | ConvertFrom-SecureString",
  ].join("; ");
  const result = runPowerShell(script, secret);
  return result.trim();
}

export function unprotectWithWindowsSecureString(encryptedValue: string): string {
  const script = [
    "$encrypted = [Console]::In.ReadToEnd()",
    "$secure = $encrypted | ConvertTo-SecureString",
    "$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)",
    "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }",
  ].join("; ");
  return runPowerShell(script, encryptedValue);
}

function runPowerShell(script: string, input: string): string {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "PowerShell command failed.";
    throw new Error(detail);
  }

  return result.stdout.replace(/\r?\n$/, "");
}
