# Security policy

## Supported version

Security fixes are provided for the latest published PulseClip release.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository's **Security → Report a vulnerability** flow so the report and any proof of concept remain private until a fix is available.

Include the affected version, Windows version and architecture, reproduction steps, impact, and any relevant logs with sensitive paths or recording content removed. We will acknowledge a complete report through the private advisory thread and coordinate disclosure there.

## Privacy baseline

PulseClip stores recordings on the user's PC and does not require an account. The default application flow does not upload recordings to a PulseClip server. Protected-content restrictions are not bypassed.

Release `v0.1.0` is not Authenticode-signed. Windows SmartScreen may therefore show an unrecognized-app warning even when the downloaded checksum matches the published `SHA256SUMS.txt`. A trusted code-signing certificate remains a release-hardening priority.
