import type { OutputLanguage } from "./config.js";

type FriendlyErrorKind = "api_key" | "api_credit" | "network";

type FriendlyError = {
  kind: FriendlyErrorKind;
  message: string;
  detail?: string;
};

export function formatUserFacingError(error: unknown, language: OutputLanguage): string {
  const friendly = classifyError(error, language);
  if (!friendly) {
    return error instanceof Error ? error.message : String(error);
  }

  return friendly.detail ? `${friendly.message}\ndetail: ${friendly.detail}` : friendly.message;
}

export function classifyError(error: unknown, language: OutputLanguage): FriendlyError | null {
  const status = getNumericProperty(error, "status");
  const message = getErrorText(error);
  const normalized = message.toLowerCase();
  const type = String(getUnknownProperty(error, "type") ?? getUnknownProperty(error, "errorType") ?? "").toLowerCase();
  const code = String(getUnknownProperty(error, "code") ?? "").toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    normalized.includes("invalid api key") ||
    normalized.includes("authentication") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission denied") ||
    normalized.includes("configured api key source is unavailable")
  ) {
    return {
      kind: "api_key",
      message: messages(language).api_key,
      detail: message,
    };
  }

  if (
    status === 402 ||
    status === 429 ||
    normalized.includes("credit") ||
    normalized.includes("balance") ||
    normalized.includes("billing") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("quota") ||
    normalized.includes("usage limit") ||
    normalized.includes("rate limit")
  ) {
    return {
      kind: "api_credit",
      message: messages(language).api_credit,
      detail: message,
    };
  }

  if (
    code === "enotfound" ||
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "etimedout" ||
    type.includes("api_connection") ||
    normalized.includes("network") ||
    normalized.includes("fetch failed") ||
    normalized.includes("connection") ||
    normalized.includes("timeout")
  ) {
    return {
      kind: "network",
      message: messages(language).network,
      detail: message,
    };
  }

  return null;
}

function messages(language: OutputLanguage): Record<FriendlyErrorKind, string> {
  if (language === "ja") {
    return {
      api_key:
        "Anthropic APIキーが見つからない、または無効です。carapace init を実行するか、ANTHROPIC_API_KEY などの環境変数を確認してください。",
      api_credit:
        "Anthropic APIの残高または利用上限が不足しています。Billing画面で残高・上限・自動リロード設定を確認してください。",
      network:
        "Anthropic APIに接続できません。ネット接続、プロキシ、ファイアウォール、または一時的なAPI障害を確認してください。",
    };
  }

  return {
    api_key:
      "Anthropic API key is missing or invalid. Run carapace init, or check environment variables such as ANTHROPIC_API_KEY.",
    api_credit:
      "Anthropic API credit or usage limit is insufficient. Check your Billing page for balance, limits, and auto-reload settings.",
    network:
      "Could not connect to the Anthropic API. Check your internet connection, proxy, firewall, or temporary API availability.",
  };
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

function getNumericProperty(value: unknown, key: string): number | undefined {
  const item = getUnknownProperty(value, key);
  return typeof item === "number" ? item : undefined;
}

function getUnknownProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}
