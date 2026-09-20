# Changelog

## 0.3.3 - 2026-09-21

### Fixes

- Preserve the local runtime source location in source-built XPI packages after Zotero installs them.
- Initialize NVM and common CLI paths when launching WSL runtime; quote shell arguments and share concurrent startup attempts.
- Detect installed agents on connection and refresh preferences without requiring a chat request.
- Discover native and NVM CLI installations when the shell PATH is incomplete.
- Fill an unset working directory from the authenticated runtime while preserving explicit user settings.

### Validation

- Add regression coverage for installed XPI startup, quoted paths, concurrent connections, CLI discovery, and default working directory recovery.
- Locally built XPI packages still require the source checkout and its installed dependencies. Windows Zotero UI validation remains manual.
