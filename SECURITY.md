# Security Policy

Carapace is a security tool, so reports about Carapace itself are handled conservatively.

## Supported Versions

Only the latest published version is supported during the early release phase.

## Reporting a Vulnerability

Please do not publish exploit details publicly before there is a reasonable chance to investigate.

Use the public repository's private vulnerability reporting channel when it is available. If the channel is not available yet, open a minimal public issue asking for a security contact, without including exploit details.

Include:

- Affected Carapace version
- Operating system and Node.js version
- The command you ran
- The smallest reproduction you can share safely
- Whether the issue involves local file reads, prompt injection, API key handling, command execution, or network access

## Scope

In scope:

- Reading files outside the selected scan root
- Symlink or junction bypasses
- Prompt-injection failures where scanned code changes Carapace's instructions
- API key exposure
- Unexpected network access beyond the intended model API call
- Command execution triggered by scanned repository content
- Corruption or unsafe handling of `.carapace/` run records

Out of scope:

- Findings in third-party projects scanned with Carapace
- Model-quality disagreements without a concrete Carapace bug
- Reports that require publishing another project's private code

## Disclosure Expectations

Carapace reports should be treated as leads until validated. When reporting vulnerabilities found in other projects, follow that project's disclosure policy and include code evidence, attack prerequisites, and limits.
