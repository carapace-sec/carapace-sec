import type { OutputLanguage } from "./config.js";

export type ScanMessages = {
  scan: {
    started: (resolvedPath: string) => string;
    targetPathNotFound: (resolvedPath: string) => string;
    profile: (profile: string) => string;
    readFiles: (readCount: number, targetCount: number) => string;
    failedToReadFiles: (count: number) => string;
    fileReadFailure: (relativePath: string, error: string) => string;
    runId: (runId: string) => string;
    savedRunRecord: (runFilePath: string) => string;
    triageModel: (model: string) => string;
    triageCandidates: (count: number) => string;
    autoDeepDiveCandidates: (count: number) => string;
    recommendedManualDeepDives: (count: number) => string;
    stepTriageOnly: () => string;
    deepDiveSkipped: () => string;
    reportableNotComputed: () => string;
    deepDiveModel: (model: string) => string;
    deepDiveAnalyses: (count: number) => string;
    reportableConcerns: (count: number) => string;
    reportTitle: () => string;
    reportUnderline: () => string;
    aiTriageSkipped: () => string;
    aiAnalysisFailed: (message: string) => string;
    triageInProgress: (model: string) => string;
    deepDiveInProgress: (count: number, model: string) => string;
  };
  trail: {
    title: () => string;
    underline: () => string;
    targetFiles: (count: number) => string;
    missingExpectedFiles: (count: number) => string;
    none: () => string;
    readBytes: (bytes: number) => string;
    readLines: (lines: number) => string;
    triageTitle: () => string;
    noCandidates: () => string;
    autoDeepDiveTitle: () => string;
    manualDeepDiveTitle: () => string;
    deepDiveTitle: () => string;
    noAnalyses: () => string;
    reason: (reason: string) => string;
    manualDeepDiveReason: (reason: string) => string;
    shouldReport: (value: boolean) => string;
  };
};

export type ReportMessages = {
  noReportableConcerns: (runFilePath: string) => string;
  noDeepDiveRecord: (runFilePath: string) => string;
  run: (runId: string) => string;
  profile: (profile: string) => string;
  summaryTitle: () => string;
  impactTitle: () => string;
  attackPrerequisitesTitle: () => string;
  attackStoryTitle: () => string;
  codeEvidenceTitle: () => string;
  disconfirmingEvidenceTitle: () => string;
  recommendedFixesTitle: () => string;
  verdictTitle: () => string;
  relatedConcernsTitle: () => string;
  relatedSummary: (summary: string) => string;
  relatedImpact: (impact: string) => string;
  relatedVerdict: (shouldReport: boolean, verdict: string, confidence: string) => string;
  humanValidation: (reason: string) => string;
  validatedAuthenticatedInputPrecondition: (operationalContext: string) => string;
  validatedAuthenticatedInputLimit: () => string;
  recommendedExternalUrlSsrfFixes: () => string[];
  recommendedResourceExhaustionFixes: () => string[];
};

export type InitMessages = {
  prefix: (message: string) => string;
  configSaved: (configPath: string) => string;
  apiKeySourceEnv: (envVar: string) => string;
  encryptedCredentialSaved: (credentialPath: string) => string;
  triageModel: (preset: string, model: string) => string;
  deepDiveModel: (model: string) => string;
  outputLanguage: (language: OutputLanguage) => string;
  noApiKeyFound: (envVar: string) => string;
  interactiveOrEnv: () => string;
  windowsOnlyStorage: () => string;
  setApiKeyAndRetry: () => string;
  emptyApiKey: () => string;
  apiKeyPrompt: () => string;
};

export type ReviewMessages = {
  help: () => string;
  prefix: (message: string) => string;
  noDeepDiveRecord: (runFilePath: string) => string;
  noAnalysisForTriageId: (triageId: string) => string;
  noUnreviewedConcerns: () => string;
  target: (triageId: string) => string;
  run: (runId: string) => string;
  profile: (profile: string) => string;
  finding: (severity: string, title: string) => string;
  path: (relativePath: string) => string;
  deepDiveVerdict: (verdict: string) => string;
  confidence: (confidence: string) => string;
  summaryTitle: () => string;
  attackStoryTitle: () => string;
  noInteractiveTerminal: () => string;
  verdictTitle: () => string;
  verdictOptions: () => string[];
  verdictQuestion: () => string;
  invalidVerdictChoice: () => string;
  noteQuestion: () => string;
  savedAnswer: (verdict: string, triageId: string) => string;
  runFile: (runFilePath: string) => string;
  nextReview: () => string;
  unknownOption: (option: string) => string;
  unexpectedArgument: (value: string) => string;
  missingValue: (option: string) => string;
  unknownVerdict: (value: string) => string;
};

export type DeepDiveMessages = {
  prefix: (message: string) => string;
  missingArgs: () => string;
  usage: () => string;
  failedToReadFile: (relativePath: string, error: string) => string;
  target: (candidateId: string) => string;
  run: (runId: string) => string;
  profile: (profile: string) => string;
  candidate: (confidence: string, relativePath: string, title: string) => string;
  skippedNoApiKey: () => string;
  model: (model: string) => string;
  analyses: (count: number) => string;
  analysisLine: (verdict: string, confidence: string, relativePath: string, title: string) => string;
  shouldReport: (value: boolean) => string;
  savedRecord: (runFilePath: string) => string;
  noScanRunRecord: (runFilePath: string) => string;
  noTriageRecord: (runFilePath: string) => string;
  noTriageCandidate: (candidateId: string) => string;
};

const EN_SCAN_MESSAGES: ScanMessages = {
  scan: {
    started: (resolvedPath) => `carapace scan: ${resolvedPath}`,
    targetPathNotFound: (resolvedPath) => `Target path does not exist: ${resolvedPath}`,
    profile: (profile) => `Profile: ${profile}`,
    readFiles: (readCount, targetCount) => `Read files: ${readCount}/${targetCount}`,
    failedToReadFiles: (count) => `Failed to read files: ${count}`,
    fileReadFailure: (relativePath, error) => `  - ${relativePath}: ${error}`,
    runId: (runId) => `Run ID: ${runId}`,
    savedRunRecord: (runFilePath) => `Saved run record: ${runFilePath}`,
    triageModel: (model) => `Triage model: ${model}`,
    triageCandidates: (count) => `Triage candidates: ${count}`,
    autoDeepDiveCandidates: (count) => `Auto deep-dive candidates (medium/high): ${count}`,
    recommendedManualDeepDives: (count) => `Recommended manual deep-dives (low!): ${count}`,
    stepTriageOnly: () => "Step mode: triage only. Deep dive and report skipped.",
    deepDiveSkipped: () => "Deep dive skipped by --no-deep-dive. Report skipped.",
    reportableNotComputed: () => "Reportable concerns: not computed (deep dive skipped).",
    deepDiveModel: (model) => `Deep dive model: ${model}`,
    deepDiveAnalyses: (count) => `Deep dive analyses: ${count}`,
    reportableConcerns: (count) => `Reportable concerns: ${count}`,
    reportTitle: () => "Report",
    reportUnderline: () => "------",
    aiTriageSkipped: () => "AI triage skipped. Run carapace init to configure an API key.",
    aiAnalysisFailed: (message) => `AI analysis failed: ${message}`,
    triageInProgress: (model) => `Running triage... (${model})`,
    deepDiveInProgress: (count, model) => `Running deep dive... (${count} candidates, ${model})`,
  },
  trail: {
    title: () => "Scan trail",
    underline: () => "----------",
    targetFiles: (count) => `Target files (${count}):`,
    missingExpectedFiles: (count) => `Missing expected files (${count}):`,
    none: () => "  - none",
    readBytes: (bytes) => `Read bytes: ${bytes}`,
    readLines: (lines) => `Read lines: ${lines}`,
    triageTitle: () => "Triage trail:",
    noCandidates: () => "  - no candidates",
    autoDeepDiveTitle: () => "Auto deep-dive trail:",
    manualDeepDiveTitle: () => "Manual deep-dive recommendation trail:",
    deepDiveTitle: () => "Deep-dive trail:",
    noAnalyses: () => "  - no analyses",
    reason: (reason) => `    reason: ${reason}`,
    manualDeepDiveReason: (reason) => `    manual deep-dive: ${reason}`,
    shouldReport: (value) => `    shouldReport: ${value}`,
  },
};

const EN_REPORT_MESSAGES: ReportMessages = {
  noReportableConcerns: (runFilePath) => `No reportable concerns found in ${runFilePath}.`,
  noDeepDiveRecord: (runFilePath) =>
    `No scan.deep_dive record found in ${runFilePath}. Run scan without --step triage or --no-deep-dive first.`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `Profile: ${profile}`,
  summaryTitle: () => "Summary",
  impactTitle: () => "Impact",
  attackPrerequisitesTitle: () => "Attack prerequisites",
  attackStoryTitle: () => "Attack story",
  codeEvidenceTitle: () => "Code evidence",
  disconfirmingEvidenceTitle: () => "Counter-evidence and limits",
  recommendedFixesTitle: () => "Recommended fixes",
  verdictTitle: () => "Verdict",
  relatedConcernsTitle: () => "Related concerns",
  relatedSummary: (summary) => `Summary: ${summary}`,
  relatedImpact: (impact) => `Impact: ${impact}`,
  relatedVerdict: (shouldReport, verdict, confidence) =>
    `Verdict: shouldReport=${shouldReport}, verdict=${verdict}, confidence=${confidence}`,
  humanValidation: (reason) => `Human validation: ${reason}`,
  validatedAuthenticatedInputPrecondition: (operationalContext) =>
    `The attacker is an authenticated user who can control the relevant external input, or a compromised account with those privileges. ${operationalContext}`,
  validatedAuthenticatedInputLimit: () =>
    "This is not necessarily an anonymous attack; it may require an authenticated user or compromised account that can control the relevant input.",
  recommendedExternalUrlSsrfFixes: () => [
    "Restrict external URLs to expected schemes such as https and reject file/http/localhost/loopback/link-local/private IP targets when they are not required.",
    "Resolve DNS and validate the resolved IP; revalidate redirect targets with the same rules.",
    "Do not store external fetch error details or response snippets where lower-privileged users can see them.",
    "Check internal services and metadata endpoints reachable from production, and block them at the network layer if needed.",
  ],
  recommendedResourceExhaustionFixes: () => [
    "Enforce Content-Length and actual bytes-read limits; abort fetches when the limit is exceeded.",
    "Limit size while streaming before converting the full body with res.text().",
    "Confirm production runtime heap/container memory limits and set an allowed external response size.",
  ],
};

const EN_INIT_MESSAGES: InitMessages = {
  prefix: (message) => `carapace init: ${message}`,
  configSaved: (configPath) => `Carapace config saved: ${configPath}`,
  apiKeySourceEnv: (envVar) => `API key source: environment variable ${envVar}`,
  encryptedCredentialSaved: (credentialPath) => `Encrypted credential saved: ${credentialPath}`,
  triageModel: (preset, model) => `Triage model: ${preset} (${model})`,
  deepDiveModel: (model) => `Deep dive model: ${model}`,
  outputLanguage: (language) => `Output language: ${language}`,
  noApiKeyFound: (envVar) => `No API key found in ${envVar}.`,
  interactiveOrEnv: () => "Run carapace init in an interactive terminal, or set ANTHROPIC_API_KEY first.",
  windowsOnlyStorage: () => "Encrypted prompt-based storage is currently implemented for Windows only.",
  setApiKeyAndRetry: () => "Set ANTHROPIC_API_KEY and run carapace init again.",
  emptyApiKey: () => "API key was empty. Nothing saved.",
  apiKeyPrompt: () => "Anthropic API key: ",
};

const EN_REVIEW_MESSAGES: ReviewMessages = {
  help: () => `Carapace review

Usage:
  carapace review [run-id-or-file] [--lang ja|en]
  carapace review [run-id-or-file] --triage-id <id> --verdict <value> [--note <text>] [--lang ja|en]

Verdicts:
  real_concern      Real concern
  false_positive    False positive
  needs_validation  Needs validation
`,
  prefix: (message) => `carapace review: ${message}`,
  noDeepDiveRecord: (runFilePath) =>
    `No scan.deep_dive record found in ${runFilePath}. Run scan without --step triage or --no-deep-dive first.`,
  noAnalysisForTriageId: (triageId) => `No deep-dive analysis found for triage id: ${triageId}`,
  noUnreviewedConcerns: () =>
    "No unreviewed reportable concerns found. Use --triage-id to add another review answer.",
  target: (triageId) => `Review target: ${triageId}`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `Profile: ${profile}`,
  finding: (severity, title) => `Finding: [${severity}] ${title}`,
  path: (relativePath) => `Path: ${relativePath}`,
  deepDiveVerdict: (verdict) => `Deep-dive verdict: ${verdict}`,
  confidence: (confidence) => `Confidence: ${confidence}`,
  summaryTitle: () => "Summary:",
  attackStoryTitle: () => "Attack story:",
  noInteractiveTerminal: () =>
    "No interactive terminal detected. Use --verdict real_concern|false_positive|needs_validation.",
  verdictTitle: () => "Verdict:",
  verdictOptions: () => [
    "  1. real_concern      Real concern",
    "  2. false_positive    False positive",
    "  3. needs_validation  Needs validation",
  ],
  verdictQuestion: () => "Choose 1/2/3 or verdict name: ",
  invalidVerdictChoice: () =>
    "Please enter 1, 2, 3, real_concern, false_positive, or needs_validation.",
  noteQuestion: () => "Note (optional): ",
  savedAnswer: (verdict, triageId) => `Saved review.answer: ${verdict} for ${triageId}`,
  runFile: (runFilePath) => `Run file: ${runFilePath}`,
  nextReview: () => "Next: run carapace review again to review the next unreviewed concern.",
  unknownOption: (option) => `Unknown review option: ${option}`,
  unexpectedArgument: (value) => `Unexpected extra argument: ${value}`,
  missingValue: (option) => `Missing value for ${option}`,
  unknownVerdict: (value) => `Unknown review verdict: ${value}`,
};

const EN_DEEP_DIVE_MESSAGES: DeepDiveMessages = {
  prefix: (message) => `carapace deep-dive: ${message}`,
  missingArgs: () => "missing <run-id-or-file> or <candidate-id>.",
  usage: () => "Usage: carapace deep-dive <run-id-or-file> <candidate-id> [--lang ja|en]",
  failedToReadFile: (relativePath, error) => `Failed to read ${relativePath}: ${error}`,
  target: (candidateId) => `Manual deep dive target: ${candidateId}`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `Profile: ${profile}`,
  candidate: (confidence, relativePath, title) => `Candidate: [${confidence}] ${relativePath}: ${title}`,
  skippedNoApiKey: () => "Manual deep dive skipped. Run carapace init to configure an API key.",
  model: (model) => `Deep dive model: ${model}`,
  analyses: (count) => `Deep dive analyses: ${count}`,
  analysisLine: (verdict, confidence, relativePath, title) =>
    `  - [${verdict}/${confidence}] ${relativePath}: ${title}`,
  shouldReport: (value) => `    shouldReport: ${value}`,
  savedRecord: (runFilePath) => `Saved deep dive record: ${runFilePath}`,
  noScanRunRecord: (runFilePath) => `No scan.run record found in ${runFilePath}.`,
  noTriageRecord: (runFilePath) => `No scan.triage record found in ${runFilePath}.`,
  noTriageCandidate: (candidateId) => `No triage candidate found for id: ${candidateId}`,
};

const JA_SCAN_MESSAGES: ScanMessages = {
  scan: {
    started: (resolvedPath) => `carapace scan: ${resolvedPath}`,
    targetPathNotFound: (resolvedPath) => `対象パスが見つかりません: ${resolvedPath}`,
    profile: (profile) => `プロファイル: ${profile}`,
    readFiles: (readCount, targetCount) => `読み込んだファイル数: ${readCount}/${targetCount}`,
    failedToReadFiles: (count) => `読み込み失敗: ${count}件`,
    fileReadFailure: (relativePath, error) => `  - ${relativePath}: ${error}`,
    runId: (runId) => `Run ID: ${runId}`,
    savedRunRecord: (runFilePath) => `実行記録: ${runFilePath}`,
    triageModel: (model) => `トリアージモデル: ${model}`,
    triageCandidates: (count) => `トリアージ候補: ${count}件`,
    autoDeepDiveCandidates: (count) => `自動deep-dive対象（medium/high）: ${count}件`,
    recommendedManualDeepDives: (count) => `任意deep-dive推奨（low!）: ${count}件`,
    stepTriageOnly: () => "ステップ実行: triageで停止。deep-diveとreportはスキップしました。",
    deepDiveSkipped: () => "--no-deep-diveによりdeep-diveをスキップしました。reportもスキップします。",
    reportableNotComputed: () => "報告対象: 未計算（deep-diveをスキップしたため）",
    deepDiveModel: (model) => `Deep-diveモデル: ${model}`,
    deepDiveAnalyses: (count) => `Deep-dive解析: ${count}件`,
    reportableConcerns: (count) => `報告対象: ${count}件`,
    reportTitle: () => "報告",
    reportUnderline: () => "----",
    aiTriageSkipped: () => "AIトリアージをスキップしました。carapace initでAPIキーを設定してください。",
    aiAnalysisFailed: (message) => `AI解析に失敗しました: ${message}`,
    triageInProgress: (model) => `トリアージを実行中... (${model})`,
    deepDiveInProgress: (count, model) => `Deep-diveを実行中... (${count}件, ${model})`,
  },
  trail: {
    title: () => "調査の足跡",
    underline: () => "----------",
    targetFiles: (count) => `対象ファイル (${count}件):`,
    missingExpectedFiles: (count) => `見つからなかった想定ファイル (${count}件):`,
    none: () => "  - なし",
    readBytes: (bytes) => `読み込みバイト数: ${bytes}`,
    readLines: (lines) => `読み込み行数: ${lines}`,
    triageTitle: () => "トリアージの足跡:",
    noCandidates: () => "  - 候補なし",
    autoDeepDiveTitle: () => "自動deep-dive対象:",
    manualDeepDiveTitle: () => "任意deep-dive推奨:",
    deepDiveTitle: () => "Deep-diveの足跡:",
    noAnalyses: () => "  - 解析なし",
    reason: (reason) => `    理由: ${reason}`,
    manualDeepDiveReason: (reason) => `    任意deep-dive: ${reason}`,
    shouldReport: (value) => `    shouldReport: ${value}`,
  },
};

const JA_REPORT_MESSAGES: ReportMessages = {
  noReportableConcerns: (runFilePath) => `${runFilePath} に報告対象の懸念はありません。`,
  noDeepDiveRecord: (runFilePath) =>
    `${runFilePath} に scan.deep_dive 記録がありません。先に --step triage や --no-deep-dive なしで scan を実行してください。`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `プロファイル: ${profile}`,
  summaryTitle: () => "概要",
  impactTitle: () => "影響",
  attackPrerequisitesTitle: () => "攻撃前提",
  attackStoryTitle: () => "攻撃筋書き",
  codeEvidenceTitle: () => "コード根拠",
  disconfirmingEvidenceTitle: () => "反証・制限",
  recommendedFixesTitle: () => "推奨修正",
  verdictTitle: () => "判定",
  relatedConcernsTitle: () => "関連懸念",
  relatedSummary: (summary) => `概要: ${summary}`,
  relatedImpact: (impact) => `影響: ${impact}`,
  relatedVerdict: (shouldReport, verdict, confidence) =>
    `判定: shouldReport=${shouldReport}, verdict=${verdict}, confidence=${confidence}`,
  humanValidation: (reason) => `答え合わせ: ${reason}`,
  validatedAuthenticatedInputPrecondition: (operationalContext) =>
    `攻撃者は、対象の外部入力を操作できる認証済みユーザー、またはその侵害済みアカウントです。${operationalContext}`,
  validatedAuthenticatedInputLimit: () =>
    "匿名攻撃とは限らず、対象の入力を操作できる認証済みユーザーまたは侵害済みアカウントが前提になります。",
  recommendedExternalUrlSsrfFixes: () => [
    "外部URLをhttpsなど想定スキームに限定し、不要なfile/http/localhost/loopback/link-local/private IPを拒否する。",
    "DNS解決後のIPを検査し、リダイレクト先も同じ基準で再検査する。",
    "外部取得結果のエラー詳細や本文断片を、低権限ユーザーに見える場所へ保存しない。",
    "本番環境で到達可能な内部サービスやメタデータエンドポイントを確認し、必要ならネットワーク側でも遮断する。",
  ],
  recommendedResourceExhaustionFixes: () => [
    "Content-Lengthと実読み込みバイト数の上限を設け、上限超過時は取得を中断する。",
    "res.text()で全量を文字列化する前に、ストリーム読み込みでサイズを制限する。",
    "本番の実行環境のヒープ上限とコンテナメモリ上限を確認し、外部レスポンスの許容サイズを決める。",
  ],
};

const JA_INIT_MESSAGES: InitMessages = {
  prefix: (message) => `carapace init: ${message}`,
  configSaved: (configPath) => `Carapace設定を保存しました: ${configPath}`,
  apiKeySourceEnv: (envVar) => `APIキー: 環境変数 ${envVar} を使用`,
  encryptedCredentialSaved: (credentialPath) => `暗号化した認証情報を保存しました: ${credentialPath}`,
  triageModel: (preset, model) => `トリアージモデル: ${preset} (${model})`,
  deepDiveModel: (model) => `Deep-diveモデル: ${model}`,
  outputLanguage: (language) => `出力言語: ${language}`,
  noApiKeyFound: (envVar) => `${envVar} にAPIキーが見つかりません。`,
  interactiveOrEnv: () =>
    "対話できるターミナルで carapace init を実行するか、先に ANTHROPIC_API_KEY を設定してください。",
  windowsOnlyStorage: () => "プロンプト入力による暗号化保存は、現在Windowsだけに対応しています。",
  setApiKeyAndRetry: () => "ANTHROPIC_API_KEY を設定してから、もう一度 carapace init を実行してください。",
  emptyApiKey: () => "APIキーが空でした。保存せずに終了します。",
  apiKeyPrompt: () => "Anthropic API key: ",
};

const JA_REVIEW_MESSAGES: ReviewMessages = {
  help: () => `Carapace review

使い方:
  carapace review [run-id-or-file] [--lang ja|en]
  carapace review [run-id-or-file] --triage-id <id> --verdict <value> [--note <text>] [--lang ja|en]

判定値:
  real_concern      本物の懸念
  false_positive    誤検知
  needs_validation  要検証
`,
  prefix: (message) => `carapace review: ${message}`,
  noDeepDiveRecord: (runFilePath) =>
    `${runFilePath} に scan.deep_dive 記録がありません。先に --step triage や --no-deep-dive なしで scan を実行してください。`,
  noAnalysisForTriageId: (triageId) => `triage id ${triageId} のdeep-dive解析が見つかりません。`,
  noUnreviewedConcerns: () =>
    "未レビューの報告対象はありません。別の候補を答え合わせする場合は --triage-id を指定してください。",
  target: (triageId) => `レビュー対象: ${triageId}`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `プロファイル: ${profile}`,
  finding: (severity, title) => `懸念: [${severity}] ${title}`,
  path: (relativePath) => `パス: ${relativePath}`,
  deepDiveVerdict: (verdict) => `Deep-dive判定: ${verdict}`,
  confidence: (confidence) => `確信度: ${confidence}`,
  summaryTitle: () => "概要:",
  attackStoryTitle: () => "攻撃筋書き:",
  noInteractiveTerminal: () =>
    "対話できるターミナルではありません。--verdict real_concern|false_positive|needs_validation を指定してください。",
  verdictTitle: () => "答え合わせ:",
  verdictOptions: () => [
    "  1. real_concern      本物の懸念",
    "  2. false_positive    誤検知",
    "  3. needs_validation  要検証",
  ],
  verdictQuestion: () => "1/2/3 または判定名を入力: ",
  invalidVerdictChoice: () =>
    "1, 2, 3, real_concern, false_positive, needs_validation のいずれかを入力してください。",
  noteQuestion: () => "メモ（任意）: ",
  savedAnswer: (verdict, triageId) => `review.answerを保存しました: ${verdict} (${triageId})`,
  runFile: (runFilePath) => `Runファイル: ${runFilePath}`,
  nextReview: () => "次: carapace review をもう一度実行すると、次の未レビュー懸念を答え合わせできます。",
  unknownOption: (option) => `不明なreviewオプションです: ${option}`,
  unexpectedArgument: (value) => `余分な引数があります: ${value}`,
  missingValue: (option) => `${option} の値がありません。`,
  unknownVerdict: (value) => `不明なreview判定です: ${value}`,
};

const JA_DEEP_DIVE_MESSAGES: DeepDiveMessages = {
  prefix: (message) => `carapace deep-dive: ${message}`,
  missingArgs: () => "<run-id-or-file> または <candidate-id> がありません。",
  usage: () => "使い方: carapace deep-dive <run-id-or-file> <candidate-id> [--lang ja|en]",
  failedToReadFile: (relativePath, error) => `${relativePath} の読み込みに失敗しました: ${error}`,
  target: (candidateId) => `任意deep-dive対象: ${candidateId}`,
  run: (runId) => `Run: ${runId}`,
  profile: (profile) => `プロファイル: ${profile}`,
  candidate: (confidence, relativePath, title) => `候補: [${confidence}] ${relativePath}: ${title}`,
  skippedNoApiKey: () => "任意deep-diveをスキップしました。carapace initでAPIキーを設定してください。",
  model: (model) => `Deep-diveモデル: ${model}`,
  analyses: (count) => `Deep-dive解析: ${count}件`,
  analysisLine: (verdict, confidence, relativePath, title) =>
    `  - [${verdict}/${confidence}] ${relativePath}: ${title}`,
  shouldReport: (value) => `    shouldReport: ${value}`,
  savedRecord: (runFilePath) => `deep-dive記録を保存しました: ${runFilePath}`,
  noScanRunRecord: (runFilePath) => `${runFilePath} に scan.run 記録がありません。`,
  noTriageRecord: (runFilePath) => `${runFilePath} に scan.triage 記録がありません。`,
  noTriageCandidate: (candidateId) => `id ${candidateId} のトリアージ候補が見つかりません。`,
};

export function getScanMessages(language: OutputLanguage): ScanMessages {
  return language === "ja" ? JA_SCAN_MESSAGES : EN_SCAN_MESSAGES;
}

export function getReportMessages(language: OutputLanguage): ReportMessages {
  return language === "ja" ? JA_REPORT_MESSAGES : EN_REPORT_MESSAGES;
}

export function getInitMessages(language: OutputLanguage): InitMessages {
  return language === "ja" ? JA_INIT_MESSAGES : EN_INIT_MESSAGES;
}

export function getReviewMessages(language: OutputLanguage): ReviewMessages {
  return language === "ja" ? JA_REVIEW_MESSAGES : EN_REVIEW_MESSAGES;
}

export function getDeepDiveMessages(language: OutputLanguage): DeepDiveMessages {
  return language === "ja" ? JA_DEEP_DIVE_MESSAGES : EN_DEEP_DIVE_MESSAGES;
}

export function getHelpText(language: OutputLanguage): string {
  if (language === "ja") {
    return `Carapace

使い方:
  carapace init [--triage-model haiku|sonnet] [--lang ja|en]
  carapace scan <path> [--profile <name>] [--triage-model haiku|sonnet] [--step triage] [--no-deep-dive] [--verbose|--log] [--lang ja|en]
  carapace deep-dive <run-id-or-file> <candidate-id> [--lang ja|en]
  carapace report [run-id-or-file] [--lang ja|en]
  carapace review [run-id-or-file] [--lang ja|en]
  carapace help [--lang ja|en]

コマンド:
  init         ローカルのAnthropic APIキーを設定し、無料で選べるトリアージモデルを保存します。
               --triage-model haiku は低コスト、--triage-model sonnet は強めのトリアージです。
               deep-diveは固定でOpusを使います。--triage-model はトリアージだけを変えます。
               --lang ja|en を指定すると、今後の出力言語として設定ファイルに保存します。
  scan <path> ファイル収集、読み込み、記録、トリアージ、medium/highの自動deep-dive、報告まで実行します。
               --triage-model sonnet は、そのscanだけ保存済みモデルを一時上書きします。
               deep-diveはOpus固定です。
               --step triage または --no-deep-dive で開発用に途中停止できます。
               --verbose または --log で調査の足跡を表示します。
               [low!] はlowだが任意deep-dive推奨の印です。自動deep-diveはしません。
               --lang ja|en でこのscanの出力言語を上書きします。
               組み込みprofile: auto-initial, carapace-self-initial
               ローカルprofile: .carapace/profiles/<name>.json
  deep-dive    記録済みのトリアージ候補を1件だけ、Opusで任意deep-diveします。
  report       記録済みrunから、報告対象の懸念を標準フォーマットで表示します。
  review       報告対象を答え合わせし、review.answerとして記録します。
  help         このヘルプを表示します。
`;
  }

  return `Carapace

Usage:
  carapace init [--triage-model haiku|sonnet] [--lang ja|en]
  carapace scan <path> [--profile <name>] [--triage-model haiku|sonnet] [--step triage] [--no-deep-dive] [--verbose|--log] [--lang ja|en]
  carapace deep-dive <run-id-or-file> <candidate-id> [--lang ja|en]
  carapace report [run-id-or-file] [--lang ja|en]
  carapace review [run-id-or-file] [--lang ja|en]
  carapace help [--lang ja|en]

Commands:
  init         Configure local Anthropic API key access and choose a free triage model preset.
               Use --triage-model haiku for lowest-cost triage or --triage-model sonnet for stronger triage.
               Deep-dive uses the fixed Opus model; --triage-model only changes triage.
               Use --lang ja|en to save a preferred output language in the config file.
  scan <path> Collect files, read them, record the run, triage, deep-dive medium/high candidates, and print a report.
               Use --triage-model sonnet to override the saved triage model for this scan only.
               Deep-dive remains fixed to Opus when scan continues past triage.
               Use --step triage or --no-deep-dive for development checks that stop before deep-dive/report.
               Use --verbose or --log to show the scan trail.
               [low!] means low severity but recommended for optional manual deep-dive; it is not auto deep-dived.
               Use --lang ja|en to override output language for this scan.
               Built-in profiles: auto-initial, carapace-self-initial
               Local profiles: .carapace/profiles/<name>.json
  deep-dive    Deep-dive one recorded triage candidate by id using the fixed Opus model.
  report       Read a recorded run and print reportable concerns in the standard report format.
  review       Review one recorded concern and save human feedback as review.answer.
  help         Show this help message.
`;
}

export function resolveOutputLanguage(input: {
  explicit?: OutputLanguage;
  configured?: OutputLanguage;
  env?: NodeJS.ProcessEnv;
}): OutputLanguage {
  return input.explicit ?? input.configured ?? detectOutputLanguage(input.env ?? process.env);
}

export function detectOutputLanguage(env: NodeJS.ProcessEnv = process.env): OutputLanguage {
  const lang = env.LANG ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return lang.toLowerCase().startsWith("ja") ? "ja" : "en";
}
