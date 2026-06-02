# Security Policy

## Supported Versions

The `main` branch is the only supported version. Older tags receive fixes
only when a critical issue is reported.

## Reporting a Vulnerability

Please open a private security advisory on the GitHub repository
at `https://github.com/Kolzoo/cols-protocol`. Use the "Report a vulnerability"
button under the Security tab. Do not file public issues for security
defects.

When reporting, include:

- A precise description of the vulnerability.
- The git commit SHA you tested against.
- Reproduction steps or a minimal proof of concept.
- Impact assessment: what an attacker can extract or modify.

We acknowledge reports within five business days and aim to ship a fix
within thirty days for high severity issues.

## Scope

In scope:

- The on-chain Anchor program under `programs/cols`.
- The TypeScript SDK under `sdk`.
- The Rust CLI under `cli`.
- The off-chain oracle reference implementation.

Out of scope:

- Issues in third party dependencies that do not affect COLS usage.
- Denial of service through normal Solana network rate limits.
- Social engineering attacks against contributors.

## Disclosure

Once a fix is shipped and tagged, a coordinated disclosure note will be
added to `docs/security.md` describing the issue, the affected versions,
and credit to the reporter.
