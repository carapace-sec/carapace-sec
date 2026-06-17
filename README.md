# Carapace

Carapace is a local CLI that reads selected code paths and reports security concerns before attackers get there first.

The npm package is `carapace-sec`. The installed command is `carapace`.

Carapace is an early release built for narrow scans first: collect a focused set of files, triage cheaply, deep-dive only the candidates that deserve it, and record the result locally for review.

## Prerequisite: Anthropic Claude API Key

Carapace uses the Anthropic Claude API. Scans consume your own prepaid balance in Anthropic Console.

Before using Carapace:

1. Create an account at https://console.anthropic.com if you do not have one.
2. Add prepaid credit in Anthropic Console.
3. Create an API key in Anthropic Console.
4. Run `carapace init` and paste that API key when prompted.

Carapace does not provide tokens, proxy your requests, or pay model costs on your behalf.

## 前提: Anthropic Claude APIキーが必要です

CarapaceはAnthropic Claude APIを使います。スキャンには、あなた自身のAnthropic Console残高（プリペイド）が消費されます。

利用前に:

1. https://console.anthropic.com でアカウントを作成する（未作成の場合）。
2. Anthropic Consoleで残高を入金する。
3. Anthropic ConsoleでAPIキーを取得する。
4. `carapace init` を実行し、取得したAPIキーを入力する。

Carapaceはトークンを提供せず、リクエストを中継せず、モデル利用料を立て替えません。

## Install

```sh
npm install -g carapace-sec
carapace help
```

You can also try it without a global install:

```sh
npx carapace-sec help
```

## Quick Start

```sh
carapace init
carapace scan ./your-project --verbose
carapace report
carapace review
```

`carapace init` configures your own Anthropic API key. Carapace does not provide tokens, proxy your requests, or pay model costs on your behalf.

`carapace scan` records every run under `.carapace/runs/` as JSONL. A scan is not just a one-off action; it becomes reviewable material.

## Commands

```sh
carapace init [--triage-model haiku|sonnet] [--lang ja|en]
carapace scan <path> [--profile <name>] [--triage-model haiku|sonnet] [--step triage] [--no-deep-dive] [--verbose|--log] [--lang ja|en]
carapace deep-dive <run-id-or-file> <candidate-id> [--lang ja|en]
carapace report [run-id-or-file] [--lang ja|en]
carapace review [run-id-or-file] [--lang ja|en]
carapace help [--lang ja|en]
carapace --version
```

## Model Selection Is Free

Carapace lets users choose the triage model because the user pays their own token bill.

- `haiku`: lower-cost triage
- `sonnet`: stronger triage for the current scan or saved config
- deep-dive: fixed to Opus for careful validation

Model selection is not a paid feature gate. Paid product value, if added later, belongs in dashboards, team workflows, and history management, not in basic cost control.

## How Carapace Decides What To Report

Carapace is intentionally conservative.

1. A cheaper model triages the focused file set.
2. Only medium/high candidates are deep-dived automatically.
3. Low candidates stay in the log. Stronger lows may be marked `[low!]` for optional manual deep-dive.
4. A report is printed only when the deep-dive can explain why an attacker can plausibly reach and abuse the issue.
5. Human review can mark each result as a real concern, false positive, or needs validation.

The goal is not to print many scary findings. The goal is to avoid wasting engineers' time with weak claims.

## Cost Guide

These are real-run estimates from the development history of Carapace. Anthropic prices can change. USD is the billing currency; JPY is an approximate reference at USD 1 = JPY 160.

| Scenario | Files | Lines | Auto deep-dives | Estimated cost |
| --- | ---: | ---: | ---: | ---: |
| Small webhook-style scan | 13 | 1,864 | 1 | $0.22, about JPY 35 |
| Production SaaS auth-focused scan | 11 | 8,065 | 0 | $0.12, about JPY 19 |
| Production SaaS external-URL triage only | 12 | 6,943 | 0 | $0.11, about JPY 17 |
| Production SaaS external-URL standard scan | 12 | 6,943 | 2 | $0.93, about JPY 148 |
| Medium OSS URL-ingest scan | 19 | 7,056 | 2 | $1.43, about JPY 228 |

Carapace keeps cost under control by not deep-diving every low candidate.

## Internal SaaS Case Study

The first confirmed real concern found by Carapace was in an internal SaaS used as the initial test target.

The issue was reported and addressed before public launch.

The issue class was SSRF: a server-side path accepted externally controlled URLs, fetched them from the backend, and could plausibly be abused if private-network destinations were not blocked and redirect destinations were not revalidated.

Carapace did not stop at "a URL is fetched." It checked who could set the URL, how the value flowed into backend fetch logic, what an attacker would try, and what evidence or runtime validation was still needed. That became the reporting shape used by the CLI:

- Summary
- Impact
- Attacker prerequisites
- Attack narrative
- Code evidence
- Counter-evidence and limits
- Recommended fix
- Verdict

## Transparency and Boundaries

Carapace does not rely on hidden prompt tricks.

The inspection logic, including prompts and report structure, is public by design. The value of Carapace is not secrecy; it is the review loop, accumulated validation cases, and a methodology that keeps improving.

What stays local:

- Your source code
- Your scan history in `.carapace/`
- Your review decisions
- Your API key

Carapace uses your own Anthropic API key directly. Carapace does not proxy requests, resell tokens, or upload your repository to a Carapace server.

## 日本語での境界説明

Carapace は、検査ロジックやプロンプトを隠しません。

価値は「秘密のプロンプト」ではなく、答え合わせを蓄積し、作法を磨き続ける仕組みにあります。何を見て、なぜ怪しいと判断し、なぜ報告する/しないを決めたのかを、できるだけ透明にします。

手元に残るもの:

- あなたのソースコード
- `.carapace/` のスキャン履歴
- review の答え合わせ
- あなた自身のAPIキー

Carapace はユーザー自身の Anthropic APIキーを直接使います。Carapace側のサーバーにコードをアップロードしたり、トークン代を立て替えたりしません。

## Responsible Use

Use Carapace only on code you own, code you are authorized to review, or public open-source code that you inspect locally.

If you find a vulnerability in someone else's project, follow responsible disclosure:

- Check the project's `SECURITY.md` first.
- Do not publish exploit details before maintainers have a chance to respond.
- Report only issues with clear code evidence and a plausible attack path.
- Do not use Carapace output as proof by itself; validate the finding before disclosure.

## License

MIT.
